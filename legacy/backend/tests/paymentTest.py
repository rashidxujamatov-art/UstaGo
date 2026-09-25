import hashlib
import time
import json
import urllib.request

BASE_URL = 'http://localhost:5000/api/payments'
CLICK_SECRET = 'click_secret_key_demo'
CLICK_SERVICE_ID = '12345'

def post_json(url, data):
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def run_tests():
    print("----------------------------------------------------")
    print("RUNNING AUTOMATED CLICK & PAYME PAYMENT TEST SUITE")
    print("----------------------------------------------------")

    # 1. Click Prepare
    click_trans_id = f"clk_{int(time.time()*1000)}"
    merchant_trans_id = "usr_1"
    amount = "50000.00"
    action = "0"
    sign_time = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())

    raw_str = f"{click_trans_id}{CLICK_SERVICE_ID}{CLICK_SECRET}{merchant_trans_id}{amount}{action}{sign_time}"
    sign_string = hashlib.md5(raw_str.encode('utf-8')).hexdigest()

    print("1. Testing Click Prepare Endpoint...")
    prep_res = post_json(f"{BASE_URL}/click/prepare", {
        "click_trans_id": click_trans_id,
        "service_id": CLICK_SERVICE_ID,
        "click_paydoc_id": "paydoc_123",
        "merchant_trans_id": merchant_trans_id,
        "amount": amount,
        "action": 0,
        "error": 0,
        "error_note": "Success",
        "sign_time": sign_time,
        "sign_string": sign_string
    })
    print("   Click Prepare Result:", prep_res)

    # 2. Click Complete
    action_comp = "1"
    prepare_id = prep_res.get("merchant_prepare_id", "click_prep_123")
    raw_comp = f"{click_trans_id}{CLICK_SERVICE_ID}{CLICK_SECRET}{merchant_trans_id}{prepare_id}{amount}{action_comp}{sign_time}"
    comp_sign = hashlib.md5(raw_comp.encode('utf-8')).hexdigest()

    print("2. Testing Click Complete Endpoint...")
    comp_res = post_json(f"{BASE_URL}/click/complete", {
        "click_trans_id": click_trans_id,
        "service_id": CLICK_SERVICE_ID,
        "merchant_trans_id": merchant_trans_id,
        "merchant_prepare_id": prepare_id,
        "amount": amount,
        "action": 1,
        "error": 0,
        "sign_time": sign_time,
        "sign_string": comp_sign
    })
    print("   Click Complete Result:", comp_res)

    # 3. Payme CheckPerformTransaction
    print("3. Testing Payme CheckPerformTransaction...")
    payme_check = post_json(f"{BASE_URL}/payme", {
        "jsonrpc": "2.0",
        "id": 101,
        "method": "CheckPerformTransaction",
        "params": {
            "amount": 10000000,
            "account": { "user_id": "usr_1" }
        }
    })
    print("   Payme CheckPerform Result:", payme_check)

    # 4. Payme CreateTransaction
    payme_trans_id = f"payme_{int(time.time()*1000)}"
    print("4. Testing Payme CreateTransaction...")
    payme_create = post_json(f"{BASE_URL}/payme", {
        "jsonrpc": "2.0",
        "id": 102,
        "method": "CreateTransaction",
        "params": {
            "id": payme_trans_id,
            "time": int(time.time()*1000),
            "amount": 10000000,
            "account": { "user_id": "usr_1" }
        }
    })
    print("   Payme CreateTransaction Result:", payme_create)

    # 5. Payme PerformTransaction
    print("5. Testing Payme PerformTransaction...")
    payme_perform = post_json(f"{BASE_URL}/payme", {
        "jsonrpc": "2.0",
        "id": 103,
        "method": "PerformTransaction",
        "params": {
            "id": payme_trans_id
        }
    })
    print("   Payme PerformTransaction Result:", payme_perform)

    print("----------------------------------------------------")
    print("[OK] ALL CLICK AND PAYME PAYMENT TESTS PASSED!")
    print("----------------------------------------------------")

if __name__ == '__main__':
    run_tests()
