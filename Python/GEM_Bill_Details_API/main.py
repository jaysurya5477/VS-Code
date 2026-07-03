
import pandas as pd  # pip install pandas
import requests  # pip install requests
import json
import os
import time
import base64

from Crypto.Cipher import AES  # pip install pycryptodome
from Crypto.Util.Padding import unpad

# ============================================================
# CONFIGURATION
# ============================================================

API_URL = "https://api.gem.gov.in/erp/webs/"

USERNAME = "ALIMCO"
PASSWORD = "A20911659ib13w9hgiqu2207wa6E7A86"

# AES-128 KEY (16 characters)
SECRET_KEY = "A9W$Z00TAS0W#ql0"

INPUT_FILE = "D:\\New\\VS Code\\Python\\GEM_Bill_Details_API\\Invoices.xlsx"
OUTPUT_FILE = "D:\\New\\VS Code\\Python\\GEM_Bill_Details_API\\Invoice_Output.xlsx"

ENCRYPTED_FOLDER = "D:\\New\\VS Code\\Python\\GEM_Bill_Details_API\\Encrypted"
DECRYPTED_FOLDER = "D:\\New\\VS Code\\Python\\GEM_Bill_Details_API\\Decrypted"

# ============================================================
# CREATE FOLDERS
# ============================================================

os.makedirs(ENCRYPTED_FOLDER, exist_ok=True)
os.makedirs(DECRYPTED_FOLDER, exist_ok=True)

# ============================================================
# AES DECRYPTION
# ============================================================

def decrypt_aes_ecb(cipher_text):

    if not cipher_text:
        return ""

    try:

        encrypted_bytes = base64.b64decode(cipher_text)

        cipher = AES.new(
            SECRET_KEY.encode("utf-8"),
            AES.MODE_ECB
        )

        decrypted = cipher.decrypt(encrypted_bytes)

        decrypted = unpad(
            decrypted,
            AES.block_size
        )

        return decrypted.decode("utf-8")

    except Exception as e:
        return f"DECRYPT ERROR: {str(e)}"

# ============================================================
# LOGIN API
# ============================================================

def get_token():

    payload = {
        "user": USERNAME,
        "pass": PASSWORD,
        "method": "login"
    }

    headers = {
        "Content-Type": "application/json"
    }

    response = requests.post(
        API_URL,
        json=payload,
        headers=headers,
        timeout=120
    )

    response.raise_for_status()

    response_json = response.json()

    token = response_json.get("token")

    if not token:
        raise Exception(
            f"Token not received. Response={response.text}"
        )

    return token

# ============================================================
# GET BILL
# ============================================================

def get_bill(invoice_no, token):

    payload = {
        "user": USERNAME,
        "method": "getBills",
        "from_date": "",
        "to_date": "",
        "inv_id": invoice_no,
        "offset": "0",
        "limit": ""
    }

    headers = {
        "Content-Type": "application/json",
        "authorization": token
    }

    response = requests.post(
        API_URL,
        json=payload,
        headers=headers,
        timeout=120
    )

    response.raise_for_status()

    return response.json(), response.text

# ============================================================
# MAIN
# ============================================================

def main():

    print("Logging in...")

    token = get_token()

    print("Token received.")

    df = pd.read_excel(INPUT_FILE)

    results = []

    total = len(df)

    for index, row in df.iterrows():

        invoice_no = str(
            row["InvoiceNo"]
        ).strip()

        print(
            f"[{index+1}/{total}] Processing {invoice_no}"
        )

        try:

            api_json, raw_response = get_bill(
                invoice_no,
                token
            )

            encrypted_data = api_json.get(
                "data",
                ""
            )

            decrypted_data = decrypt_aes_ecb(
                encrypted_data
            )

            # -----------------------------------
            # Save Encrypted File
            # -----------------------------------

            encrypted_file = (
                f"{ENCRYPTED_FOLDER}/"
                f"{invoice_no}_Encrypted.json"
            )

            with open(
                encrypted_file,
                "w",
                encoding="utf-8"
            ) as f:

                json.dump(
                    api_json,
                    f,
                    indent=4,
                    ensure_ascii=False
                )

            # -----------------------------------
            # Save Decrypted File
            # -----------------------------------

            decrypted_file = (
                f"{DECRYPTED_FOLDER}/"
                f"{invoice_no}_Decrypted.json"
            )

            try:

                parsed_json = json.loads(
                    decrypted_data
                )

                with open(
                    decrypted_file,
                    "w",
                    encoding="utf-8"
                ) as f:

                    json.dump(
                        parsed_json,
                        f,
                        indent=4,
                        ensure_ascii=False
                    )

            except Exception:

                with open(
                    decrypted_file,
                    "w",
                    encoding="utf-8"
                ) as f:

                    f.write(decrypted_data)

            results.append({

                "InvoiceNo":
                    invoice_no,

                "Status":
                    api_json.get("status"),

                "IAT":
                    api_json.get("iat"),

                "HMAC":
                    api_json.get("hmac"),

                "Encrypted_Data":
                    encrypted_data,

                "Decrypted_Data":
                    decrypted_data,

                "Encrypted_File":
                    encrypted_file,

                "Decrypted_File":
                    decrypted_file

            })

        except Exception as e:

            print(
                f"Error processing "
                f"{invoice_no}: {e}"
            )

            results.append({

                "InvoiceNo":
                    invoice_no,

                "Status":
                    "ERROR",

                "IAT":
                    "",

                "HMAC":
                    "",

                "Encrypted_Data":
                    "",

                "Decrypted_Data":
                    str(e),

                "Encrypted_File":
                    "",

                "Decrypted_File":
                    ""

            })

        time.sleep(0.20)

    output_df = pd.DataFrame(
        results
    )

    output_df.to_excel(
        OUTPUT_FILE,
        index=False
    )

    print()
    print("=" * 50)
    print("Completed Successfully")
    print(f"Output File : {OUTPUT_FILE}")
    print(f"Encrypted Folder : {ENCRYPTED_FOLDER}")
    print(f"Decrypted Folder : {DECRYPTED_FOLDER}")
    print("=" * 50)

# ============================================================
# ENTRY
# ============================================================

if __name__ == "__main__":
    main()
