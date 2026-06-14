#!/usr/bin/env python3
"""
อ่านบาร์โค้ด EAN-13 จากภาพด้วย OpenCV + pyzbar (เร็ว)
มี zxing-cpp และ OCR ตัวเลขใต้บาร์โค้ดเป็นทางสำรอง

ใช้งาน:
  python barcode_reader.py path/to/image.jpg
  type image.jpg | python barcode_reader.py
"""

from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

import cv2
import numpy as np
from pyzbar.pyzbar import decode as pyzbar_decode, ZBarSymbol

try:
    import zxingcpp
except ImportError:
    zxingcpp = None

try:
    import pytesseract
    if sys.platform == "win32":
        default_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(default_tesseract):
            pytesseract.pytesseract.tesseract_cmd = default_tesseract
except ImportError:
    pytesseract = None


EAN13_FORMATS = [
    ZBarSymbol.EAN13,
    ZBarSymbol.EAN8,
    ZBarSymbol.UPCA,
    ZBarSymbol.CODE128,
    ZBarSymbol.CODE39,
]


def ean13_check_digit(code12: str) -> str:
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(code12))
    return str((10 - (total % 10)) % 10)


def is_valid_ean13(code: str) -> bool:
    return len(code) == 13 and code.isdigit() and code[12] == ean13_check_digit(code[:12])


def score_barcode(code: str) -> int:
    if is_valid_ean13(code):
        return 100 if code.startswith("885") else 90
    if len(code) == 13 and code.isdigit():
        return 50
    if len(code) == 12 and code.isdigit():
        return 45
    if len(code) == 8 and code.isdigit():
        return 40
    return 10


def extract_digit_candidates(text: str) -> list[str]:
    seen: set[str] = set()
    candidates: list[tuple[int, str]] = []

    def add(value: str) -> None:
        value = value.strip()
        if not value or value in seen:
            return
        points = score_barcode(value)
        if points == 0:
            return
        seen.add(value)
        candidates.append((points, value))

    for run in re.findall(r"\d{8,16}", text):
        add(run)
        for i in range(len(run) - 12):
            add(run[i : i + 13])
        for i in range(len(run) - 11):
            add(run[i : i + 12])

    digits = re.sub(r"\D", "", text)
    for i in range(max(0, len(digits) - 11)):
        candidate = f"8{digits[i : i + 12]}"
        if is_valid_ean13(candidate):
            add(candidate)

    candidates.sort(key=lambda item: item[0], reverse=True)
    return [value for _, value in candidates]


def order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    total = pts.sum(axis=1)
    rect[0] = pts[np.argmin(total)]
    rect[2] = pts[np.argmax(total)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def warp_yellow_sticker(img: np.ndarray) -> np.ndarray | None:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array([10, 40, 80]), np.array([40, 255, 255]))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < 5000:
        return None

    box = cv2.boxPoints(cv2.minAreaRect(contour)).astype("float32")
    src = order_points(box)
    width = int(max(np.linalg.norm(src[2] - src[3]), np.linalg.norm(src[1] - src[0])))
    height = int(max(np.linalg.norm(src[1] - src[2]), np.linalg.norm(src[0] - src[3])))
    if width < 80 or height < 60:
        return None

    dst = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype="float32")
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, matrix, (width, height))


def decode_with_pyzbar(frame: np.ndarray) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for result in pyzbar_decode(frame, symbols=EAN13_FORMATS):
        data = result.data.decode("utf-8").strip()
        if data and data not in seen:
            seen.add(data)
            found.append({"type": result.type, "data": data, "source": "pyzbar"})
    return found


def decode_with_zxing(frame: np.ndarray) -> list[dict[str, str]]:
    if zxingcpp is None:
        return []

    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for result in zxingcpp.read_barcodes(frame):
        data = (result.text or "").strip()
        if data and data not in seen:
            seen.add(data)
            found.append({"type": result.format.name, "data": data, "source": "zxing"})
    return found


def decode_frame(frame: np.ndarray) -> list[dict[str, str]]:
    merged: dict[str, dict[str, str]] = {}
    for item in decode_with_pyzbar(frame) + decode_with_zxing(frame):
        merged[item["data"]] = item
    return list(merged.values())


def build_variants(img: np.ndarray) -> list[np.ndarray]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
    variants: list[np.ndarray] = [img, gray, cv2.equalizeHist(gray)]

    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.extend([binary, 255 - binary])

    height, width = gray.shape[:2]
    long_edge = max(height, width)
    if long_edge < 1800:
        scale = 1800 / long_edge
        variants.append(
            cv2.resize(gray, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_CUBIC)
        )

    for angle in (0, 90, 180, 270):
        if angle == 0:
            rotated = gray
        else:
            matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
            rotated = cv2.warpAffine(gray, matrix, (width, height), borderValue=255)
        variants.append(rotated)

        region_height, region_width = rotated.shape[:2]
        crop = rotated[int(region_height * 0.35) : int(region_height * 0.85), int(region_width * 0.05) : int(region_width * 0.95)]
        if crop.size > 0:
            variants.append(crop)

    warped = warp_yellow_sticker(img)
    if warped is not None:
        variants.append(warped)
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
        variants.append(warped_gray)
        sticker_height = warped_gray.shape[0]
        barcode_area = warped_gray[int(sticker_height * 0.55) :, :]
        if barcode_area.size > 0:
            variants.append(cv2.resize(barcode_area, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC))

    return variants


def ocr_digits(frame: np.ndarray) -> list[str]:
    if pytesseract is None:
        return []

    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
        big = cv2.resize(gray, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        _, binary = cv2.threshold(big, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        found: list[str] = []
        config = "--psm 6 -c tessedit_char_whitelist=0123456789"
        for image in (big, binary, 255 - binary):
            found.extend(extract_digit_candidates(pytesseract.image_to_string(image, config=config)))

        height = big.shape[0]
        bottom = big[int(height * 0.72) :, :]
        found.extend(
            extract_digit_candidates(
                pytesseract.image_to_string(bottom, config="--psm 7 -c tessedit_char_whitelist=0123456789")
            )
        )
        return found
    except Exception:
        return []


def scan_image(img: np.ndarray) -> dict[str, Any]:
    if img is None or img.size == 0:
        return {"candidates": [], "results": [], "method": "empty"}

    merged: dict[str, dict[str, str]] = {}

    def add_results(items: list[dict[str, str]]) -> None:
        for item in items:
            merged[item["data"]] = item

    for frame in build_variants(img):
        add_results(decode_frame(frame))
        if any(is_valid_ean13(code) for code in merged):
            break

    if not any(is_valid_ean13(code) for code in merged):
        warped = warp_yellow_sticker(img)
        ocr_targets = [warped] if warped is not None else [img]
        for target in ocr_targets:
            for candidate in ocr_digits(target):
                add_results([{"type": "EAN13", "data": candidate, "source": "ocr"}])
            if any(is_valid_ean13(code) for code in merged):
                break

    results = sorted(merged.values(), key=lambda item: score_barcode(item["data"]), reverse=True)
    candidates = [item["data"] for item in results]
    method = results[0]["source"] if results else "none"
    return {"candidates": candidates, "results": results, "method": method}


def decode_from_bytes(data: bytes) -> dict[str, Any]:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    return scan_image(img)


def main() -> int:
    if len(sys.argv) > 1:
        with open(sys.argv[1], "rb") as handle:
            payload = decode_from_bytes(handle.read())
    else:
        payload = decode_from_bytes(sys.stdin.buffer.read())

    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
