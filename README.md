# Gmail Account Switcher for Brave Browser (Manifest V3)

Extension สำหรับเลือกและเปิดบัญชี Gmail ในแท็บใหม่ได้อย่างรวดเร็วผ่าน Popup เมนู บน Brave / Chromium Browser

---

## 📂 Project Structure

```text
Brave_Extension/
├── manifest.json       # ไฟล์กำหนดโครงสร้าง Manifest V3 ของ Extension
├── popup.html          # UI Layout หน้า Popup
├── popup.css           # สไตล์ Dark Theme และ responsive layout
├── popup.js            # โค้ดสร้าง UI บัญชีแบบไดนามิก และเปิดแท็บ
├── accounts.js         # ไฟล์กำหนดรายชื่อบัญชี
└── icons/              # ไอคอน Extension ขนาดต่างๆ
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## วิธีติดตั้ง Extension บน Brave Browser (Load Unpacked)

1. เปิดเบราว์เซอร์ **Brave**
2. ไปที่แถบที่อยู่ URL แล้วพิมพ์ `brave://extensions` (หรือเมนู `Menu` -> `Extensions`)
3. เปิดสวิตช์ **Developer mode** (โหมดนักพัฒนา) ที่มุมขวาบน
4. กดปุ่ม **Load unpacked** (โหลดส่วนขยายที่ถอดรหัสแล้ว) ที่มุมซ้ายบน
5. เลือกโฟลเดอร์โครงการนี้ (`Brave_Extension`)
6. กดไอคอน Extension บนแถบเครื่องมือของ Brave เพื่อเริ่มใช้งาน
