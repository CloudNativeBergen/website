# The crafted JPEG fixtures for the Photo Wall checks (spec §6.4): files a
# lenient marker walk would pass while another reader finds metadata in them,
# plus two Pillow-made files the allow-list must still pass (progressive, and
# baseline with restart markers).
#
# Built from `canvas-chromium.jpg` (the passing canvas file) and
# `camera-exif.jpg` (Exif APP1 with a GPS IFD). Every metadata-carrying file is
# re-read here with Pillow, an independent reader, to prove the GPS is really
# in it: the refusal in the test is of a file that leaks, not of noise.
#
# Run from the repo root with Pillow 12 installed:
#   python3 __tests__/fixtures/photo-wall/make-crafted-fixtures.py
import io
import os
import struct

from PIL import Image

OUT = os.path.dirname(os.path.abspath(__file__))
GPS_IFD = 0x8825


def read(name):
    with open(os.path.join(OUT, name), 'rb') as f:
        return f.read()


def write(name, data):
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(data)


def segments(jpeg):
    """(marker, whole segment) up to and including the SOS header; the rest."""
    out, i = [], 2
    while True:
        marker = jpeg[i + 1]
        length = struct.unpack('>H', jpeg[i + 2:i + 4])[0]
        out.append((marker, jpeg[i:i + 2 + length]))
        i += 2 + length
        if marker == 0xDA:
            return out, jpeg[i:]


def segment(marker, payload):
    return bytes([0xFF, marker]) + struct.pack('>H', len(payload) + 2) + payload


def gps(image_bytes):
    return dict(Image.open(io.BytesIO(image_bytes)).getexif().get_ifd(GPS_IFD))


SOI = b'\xff\xd8'
canvas = read('canvas-chromium.jpg')
camera = read('camera-exif.jpg')
segs, scan_to_eoi = segments(canvas)
app0 = segs[0][1]
assert segs[0][0] == 0xE0 and app0[4:9] == b'JFIF\0'
tables_frame_sos = b''.join(s for m, s in segs[1:])
exif_app1 = next(s for m, s in segments(camera)[0] if m == 0xE1)
exif_payload = exif_app1[4:]  # b'Exif\0\0' + TIFF
assert gps(camera), 'camera-exif.jpg must carry a GPS IFD'

# 1. A second SOI after APP0, whose next two bytes a walker that gives SOI a
#    length reads as one, skipping the Exif APP1 behind it. Pillow treats the
#    SOI as standalone, skips the two bytes as junk and reads the APP1.
hidden = SOI + struct.pack('>H', len(exif_app1) + 2) + exif_app1
embedded_soi = SOI + app0 + hidden + tables_frame_sos + scan_to_eoi
assert gps(embedded_soi), 'Pillow must read GPS from embedded-soi.jpg'
write('embedded-soi.jpg', embedded_soi)


# 2. Two frames: a 30000 x 30000 SOF0 with a 64-byte scan, then the real
#    640 x 480 frame. Pillow stops at the first SOS: it sees 900 Mpx.
def frame(width, height):
    out = b''
    for m, s in segs[1:]:
        if m == 0xC0:
            s = s[:5] + struct.pack('>HH', height, width) + s[9:]
        out += s
    return out


scan = scan_to_eoi[:-2]
multiframe = SOI + app0 + frame(30000, 30000) + scan[:64] + frame(640, 480) + scan_to_eoi
Image.MAX_IMAGE_PIXELS = None
assert Image.open(io.BytesIO(multiframe)).size == (30000, 30000)
write('multiframe-huge-first.jpg', multiframe)

# 3a. A marker on no allow-list (JPG0, 0xF0) carrying text. The test renames
#     this marker byte to every other one off the list.
text = b'GPS 60 23 33.6 N 5 19 24 E; Make=Apple; Owner=Jane Doe'
write('unknown-marker.jpg', SOI + app0 + segment(0xF0, text) + tables_frame_sos + scan_to_eoi)

# 3b. APP0 that is not JFIF: the raw Exif (TIFF with the GPS IFD) in APP0.
exif = Image.Exif()
exif.load(exif_payload[6:])
assert dict(exif.get_ifd(GPS_IFD)), 'the APP0 payload must parse as Exif with GPS'
write('app0-exif.jpg', SOI + segment(0xE0, exif_payload) + tables_frame_sos + scan_to_eoi)

# 3c. A JFXX extension APP0 (thumbnail coded as JPEG, 0x10) whose "thumbnail"
#     is the whole camera JPEG, GPS and all.
jfxx = segment(0xE0, b'JFXX\0\x10' + camera)
assert gps(jfxx[10:]), 'the JFXX thumbnail must be a JPEG with GPS'
write('app0-jfxx.jpg', SOI + app0 + jfxx + tables_frame_sos + scan_to_eoi)

# 3d. A JFIF APP0 with a 4 x 4 RGB thumbnail (48 bytes) after its header.
header = app0[4:16]  # JFIF\0, version, units, densities
thumb = header + bytes([4, 4]) + bytes(range(48))
write('jfif-thumbnail.jpg', SOI + segment(0xE0, thumb) + tables_frame_sos + scan_to_eoi)

# 3e. A JFIF APP0 with no thumbnail but bytes after its 14-byte header.
trailing = app0[4:] + b'Owner=Jane Doe'
write('jfif-trailing.jpg', SOI + segment(0xE0, trailing) + tables_frame_sos + scan_to_eoi)


# Must PASS: Pillow's progressive encoder (SOF2, many scans, DHT between
# scans) and its baseline encoder with restart markers (DRI, RSTn in the scan).
def picture():
    ramp = Image.linear_gradient('L').resize((640, 480))
    return Image.merge('RGB', (ramp, ramp.transpose(Image.Transpose.FLIP_LEFT_RIGHT), ramp.rotate(90, expand=False)))


def markers(jpeg):
    found, i = [], 2
    while i < len(jpeg) - 1:
        if jpeg[i] == 0xFF and jpeg[i + 1] not in (0x00, 0xFF):
            found.append(jpeg[i + 1])
        i += 1
    return found


def save(**options):
    buffer = io.BytesIO()
    picture().save(buffer, 'JPEG', quality=60, **options)
    return buffer.getvalue()


progressive = save(progressive=True)
assert 0xC2 in markers(progressive) and markers(progressive).count(0xDA) > 1
assert not any(0xE1 <= m <= 0xEF or m == 0xFE for m in markers(progressive))
write('progressive.jpg', progressive)

restart = save(restart_marker_rows=1)
assert 0xDD in markers(restart) and any(0xD0 <= m <= 0xD7 for m in markers(restart))
assert not any(0xE1 <= m <= 0xEF or m == 0xFE for m in markers(restart))
write('restart-markers.jpg', restart)

print('wrote crafted fixtures to', OUT, 'with Pillow', Image.__version__)
