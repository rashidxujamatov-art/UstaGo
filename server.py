import http.server
import socketserver
import json
import os
import urllib.parse
import time

PORT = 3000
DB_FILE = os.path.join(os.path.dirname(__file__), 'database.json')

initial_data = {
  "users": [
    {
      "id": "usr_1",
      "phone": "+998 90 123-45-67",
      "email": "akmal@example.com",
      "name": "Akmal Karimov",
      "role": "Buyurtmachi",
      "balance": 10000,
      "rating": 4.9
    },
    {
      "id": "usr_2",
      "phone": "+998 91 765-43-21",
      "email": "jamshid@usta.uz",
      "name": "Jamshid (Usta)",
      "role": "Bajaruvchi",
      "balance": 50000,
      "rating": 4.9
    }
  ],
  "categories": [
    { "id": "cat_1", "name": "Ta'mirlash", "icon": "🛠️" },
    { "id": "cat_2", "name": "Maishiy", "icon": "🧹" },
    { "id": "cat_3", "name": "IT & Dizayn", "icon": "💻" },
    { "id": "cat_4", "name": "Avto", "icon": "🚗" },
    { "id": "cat_5", "name": "Logistika", "icon": "🚚" },
    { "id": "cat_6", "name": "Ta'lim", "icon": "📚" },
    { "id": "cat_7", "name": "Foto/Video", "icon": "📷" }
  ],
  "jobs": [
    {
      "id": "job_1",
      "clientId": "usr_1",
      "clientName": "Akmal Karimov",
      "title": "Kvartiraga santexnik xizmati kerak",
      "category": "Ta'mirlash",
      "budget": 250000,
      "location": "Toshkent, Chilonzor",
      "description": "Oshxona kranini almashtirish va quvurlarni tekshirish kerak. Bajarish muddati bugun.",
      "status": "OPEN",
      "offersCount": 3,
      "createdAt": "2026-09-20T22:00:00Z"
    },
    {
      "id": "job_2",
      "clientId": "usr_1",
      "clientName": "Akmal Karimov",
      "title": "Mobil ilova uchun UI/UX dizayn",
      "category": "IT & Dizayn",
      "budget": 1200000,
      "location": "Masofadan (Remote)",
      "description": "Figma dasturida 5 ta mobil ekran dizaynini yaratish kerak. Muddati 3 kun.",
      "status": "OPEN",
      "offersCount": 5,
      "createdAt": "2026-09-20T21:00:00Z"
    },
    {
      "id": "job_3",
      "clientId": "usr_3",
      "clientName": "Olimxon R.",
      "title": "Elektrik: Rozetkalarni ta'mirlash",
      "category": "Ta'mirlash",
      "budget": 150000,
      "location": "Toshkent, Yunusobod (3.1 km)",
      "description": "Xonadonda 4 ta rozetka va lyustrani ulash lozim.",
      "status": "OPEN",
      "offersCount": 1,
      "createdAt": "2026-09-20T20:00:00Z"
    }
  ],
  "offers": [],
  "chats": [],
  "messages": [],
  "reviews": []
}

def load_db():
    if not os.path.exists(DB_FILE):
        save_db(initial_data)
        return initial_data
    try:
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        save_db(initial_data)
        return initial_data

def save_db(data):
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

class MarketplaceHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path.startswith('/api/jobs'):
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            db = load_db()
            response_json = json.dumps(db.get('jobs', []), ensure_ascii=False)
            self.wfile.write(response_json.encode('utf-8'))
            return

        elif path.startswith('/api/categories'):
            self.send_response(200)
            self.send_header('Content-type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            db = load_db()
            response_json = json.dumps(db.get('categories', []), ensure_ascii=False)
            self.wfile.write(response_json.encode('utf-8'))
            return

        return super().do_GET()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        body = json.loads(post_data.decode('utf-8')) if post_data else {}
        path = self.path

        db = load_db()

        if path == '/api/auth/register':
            phone = body.get('phone', '+998900000000')
            user = next((u for u in db['users'] if u['phone'] == phone), None)
            if not user:
                user = {
                    "id": f"usr_{int(time.time()*1000)}",
                    "phone": phone,
                    "email": body.get('email', ''),
                    "name": phone,
                    "role": body.get('role', 'Buyurtmachi'),
                    "balance": 10000,
                    "rating": 5.0
                }
                db['users'].append(user)
                save_db(db)

            self.send_json({"message": "SMS OTP yuborildi", "userId": user["id"]})
            return

        elif path == '/api/auth/verify-otp':
            self.send_json({
                "success": True,
                "message": "Registratsiya tasdiqlandi",
                "bonusGranted": 10000
            })
            return

        elif path == '/api/jobs':
            new_job = {
                "id": f"job_{int(time.time()*1000)}",
                "clientId": body.get('clientId', 'usr_1'),
                "clientName": body.get('clientName', 'Akmal Karimov'),
                "title": body.get('title', 'Yangi topshiriq'),
                "category": body.get('category', "Ta'mirlash"),
                "budget": int(body.get('budget', 100000)),
                "location": body.get('location', 'Toshkent'),
                "description": body.get('description', ''),
                "status": "OPEN",
                "offersCount": 0,
                "createdAt": "2026-09-20T22:30:00Z"
            }
            db['jobs'].insert(0, new_job)
            save_db(db)
            self.send_json(new_job, status=201)
            return

        elif path == '/api/payments/click/prepare':
            click_trans_id = body.get('click_trans_id')
            merchant_trans_id = body.get('merchant_trans_id', 'usr_1')
            self.send_json({
                "error": 0,
                "error_note": "Success",
                "click_trans_id": click_trans_id,
                "merchant_trans_id": merchant_trans_id,
                "merchant_prepare_id": f"click_prep_{int(time.time()*1000)}"
            })
            return

        elif path == '/api/payments/click/complete':
            click_trans_id = body.get('click_trans_id')
            merchant_trans_id = body.get('merchant_trans_id', 'usr_1')
            amount = float(body.get('amount', 50000))
            
            # Credit User Balance
            user = next((u for u in db['users'] if u['id'] == merchant_trans_id or u['phone'] == merchant_trans_id), db['users'][0])
            user['balance'] = user.get('balance', 10000) + amount
            save_db(db)

            self.send_json({
                "error": 0,
                "error_note": "Success",
                "click_trans_id": click_trans_id,
                "merchant_trans_id": merchant_trans_id,
                "merchant_confirm_id": f"click_conf_{int(time.time()*1000)}"
            })
            return

        elif path == '/api/payments/payme':
            method = body.get('method')
            params = body.get('params', {})
            req_id = body.get('id', 1)

            if method == 'CheckPerformTransaction':
                self.send_json({"id": req_id, "result": {"allow": True}})
                return

            elif method == 'CreateTransaction':
                self.send_json({
                    "id": req_id,
                    "result": {
                        "create_time": int(time.time()*1000),
                        "transaction": f"payme_tx_{int(time.time()*1000)}",
                        "state": 1
                    }
                })
                return

            elif method == 'PerformTransaction':
                # Credit Balance
                user = db['users'][0]
                user['balance'] = user.get('balance', 10000) + 100000
                save_db(db)

                self.send_json({
                    "id": req_id,
                    "result": {
                        "transaction": f"payme_tx_{int(time.time()*1000)}",
                        "perform_time": int(time.time()*1000),
                        "state": 2
                    }
                })
                return

        self.send_json({"error": "Endpoint topilmadi"}, status=404)

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        response_json = json.dumps(data, ensure_ascii=False)
        self.wfile.write(response_json.encode('utf-8'))

if __name__ == '__main__':
    web_dir = os.path.dirname(__file__)
    os.chdir(web_dir)
    
    ports_to_try = [5000, 8080, 8000, 3000, 8888]
    httpd = None
    selected_port = None

    for p in ports_to_try:
        try:
            httpd = socketserver.TCPServer(("", p), MarketplaceHandler)
            selected_port = p
            break
        except OSError:
            continue

    if httpd and selected_port:
        print(f"[OK] UstaGo Marketplace App (Frontend + REST API) http://localhost:{selected_port} portida ishga tushdi")
        httpd.serve_forever()
    else:
        print("[ERROR] Port topilmadi")
