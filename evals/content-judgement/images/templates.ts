import QRCode from 'qrcode'

export interface ImageTemplate {
  id: string
  width: number
  height: number
  html: string
}

const style = `
*{box-sizing:border-box}body{margin:0;width:100vw;height:100vh;display:grid;place-items:center;font-family:Arial,sans-serif;color:#182233;background:radial-gradient(ellipse at top,#e8e4db,#b4b1a8)}
.paper{background:#fffdf8;box-shadow:0 18px 45px #18223345;border:1px solid #d7d4ca;padding:55px;transform:rotate(-2deg)}
h1{font-size:60px;line-height:1.08;margin:25px 0}h2{font-size:36px;margin:20px 0}p{font-size:27px;line-height:1.5}small,.eyebrow{font-size:20px;letter-spacing:3px;text-transform:uppercase}.muted{color:#657287}.rule{border-top:2px solid #d3d9df;margin:28px 0}.qr{width:235px;height:235px;image-rendering:pixelated;background:white;padding:8px}.row{display:flex;gap:35px;align-items:center}.pill{display:inline-block;padding:10px 20px;background:#d8f5eb;border-radius:8px;font-size:22px}.silhouette{width:180px;height:220px;background:radial-gradient(circle at 50% 32%,#697b89 0 36px,transparent 37px),radial-gradient(ellipse at 50% 105%,#697b89 0 85px,transparent 86px),#d9e1e5;border:2px solid #b4c2ca}.footer{font-size:18px;color:#697587;margin-top:35px}
`

function page(body: string, extra = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${style}${extra}</style></head><body>${body}</body></html>`
}

export async function imageTemplates(): Promise<ImageTemplate[]> {
  const qr = async (name: string) =>
    `<img class="qr" alt="QR code" src="${await QRCode.toDataURL(`https://example.com/${name}`, { width: 280, margin: 2 })}">`
  const templates: ImageTemplate[] = []
  const add = (id: string, body: string, extra = '', portrait = false) =>
    templates.push({
      id,
      width: portrait ? 1000 : 1300,
      height: portrait ? 1300 : 1000,
      html: page(body, extra),
    })

  add(
    'badge-1',
    `<div class="lanyard"></div><article class="paper badge"><div class="notch"></div><small>Cloud Native Days Norway</small><h1>Hedda<br>Fjordvik</h1><h2>Nordlys Compute</h2><span class="pill">ATTENDEE</span><div class="rule"></div>${await qr('badge/hedda')}<p class="muted">Meet • Learn • Connect</p></article>`,
    '.lanyard{position:absolute;top:-70px;width:100px;height:430px;background:repeating-linear-gradient(80deg,#0c5a63 0 35px,#247781 35px 40px);transform:rotate(4deg)}.badge{width:650px;z-index:1;border-radius:24px;text-align:center;border-top:35px solid #0e6971}.notch{width:110px;height:16px;border-radius:12px;background:#53585a;margin:-27px auto 45px}.badge h1{color:#105864}',
    true,
  )
  add(
    'badge-2',
    `<div class="strap"></div><article class="paper badge"><small>CND NORWAY / COMMUNITY</small><div class="rule"></div><h1>Sindre<br>Viknes</h1><h2>Fjordstack Labs</h2><p class="role">SPEAKER</p><div class="row">${await qr('badge/sindre')}<p>Share ideas.<br>Build together.</p></div></article>`,
    '.strap{position:absolute;top:0;width:76px;height:380px;background:#582b9a;box-shadow:12px 0 #392066}.badge{width:730px;border-radius:12px;z-index:1;border-bottom:55px solid #592d91;transform:rotate(3deg)}.badge h1{font-size:82px;color:#492775}.role{font-weight:bold;letter-spacing:6px;color:#592d91}',
    true,
  )
  add(
    'idcard-1',
    '<article class="paper card"><header><small>Fjordstack access services</small><h1>ID CARD</h1></header><div class="row"><div class="silhouette"></div><div><small>Full name</small><h2>Maren Solvik</h2><p>Date of birth: 14 Jun 1991<br>Card number: FS-004281</p></div></div><div class="rule"></div><small>Authorised staff • Valid through 2028</small></article>',
    '.card{width:1000px;border-radius:35px;background:repeating-linear-gradient(35deg,#f4f9fb 0 7px,#eaf2f5 7px 9px)}header{border-bottom:12px solid #245773;margin:-10px -10px 35px;padding:10px 15px}header h1{font-size:50px;margin:15px 0}',
  )
  add(
    'screen-email-1',
    '<div class="laptop"><div class="screen"><div class="toolbar">● ● ● <b>Mail</b></div><div class="mail"><aside>Inbox <b>4</b><br><br>Sent<br><br>Drafts<br><br>Archive</aside><main><small>INBOX / MESSAGE</small><h2>Delivery arrangements</h2><p class="sender">From: Eline Dalnes &lt;eline.dalnes@example.com&gt;<br>To: Support &lt;support@example.no&gt;</p><div class="rule"></div><p>Hello,<br>Please call me on <b>012 34 567</b> before delivery.<br>My home address is <b>Eksempelveien 42,<br>0000 Fjordby</b>.</p><p>Thanks,<br>Eline Dalnes</p></main></div></div><div class="base"></div></div>',
    '.laptop{width:1170px}.screen{background:white;border:24px solid #252b32;border-radius:23px;box-shadow:0 15px 25px #2224;overflow:hidden}.toolbar{background:#e6e9ee;padding:18px;color:#6d7681;font-size:22px}.toolbar b{margin-left:100px}.mail{display:flex;height:630px}aside{background:#f0f3f7;width:180px;padding:28px;font-size:23px}main{padding:35px;flex:1}.sender{font-size:21px;color:#697587}main p{font-size:25px}.base{height:34px;background:linear-gradient(#ccd0d3,#858d94);border-radius:4px 4px 45px 45px;width:1200px;margin-left:-15px}',
  )
  add(
    'screen-sms-1',
    '<div class="phone"><div class="camera"></div><div class="status">09:41 <span>▮▮▮ 100%</span></div><header>‹ &nbsp; 023 45 678</header><div class="messages"><small>Today 09:32</small><p class="bubble theirs">Hi! It&apos;s Torben. Are we still meeting later?</p><p class="bubble mine">Yes, where should I go?</p><p class="bubble theirs">My home address is Eksempelgata 18, 0000 Fjordby.</p><p class="bubble theirs">Call 023 45 678 when you arrive.</p></div><div class="compose">Message &nbsp; &nbsp; &nbsp; &nbsp; ↑</div></div>',
    '.phone{width:600px;height:1120px;background:#f7f8fa;border:19px solid #24272d;border-radius:85px;box-shadow:12px 25px 45px #18223365;overflow:hidden;transform:rotate(2deg)}.camera{height:24px;width:150px;background:#24272d;margin:0 auto;border-radius:0 0 18px 18px}.status{padding:15px 28px;font-size:20px}.status span{float:right}.phone header{border-bottom:1px solid #ccd3dc;padding:25px;font-size:30px;background:#eceef2}.messages{padding:25px;text-align:center}.messages small{font-size:16px;color:#83909c;letter-spacing:0;text-transform:none}.bubble{text-align:left;padding:20px 24px;border-radius:28px;font-size:27px;max-width:430px}.theirs{background:#e2e5e9}.mine{background:#1572e8;color:white;margin-left:auto}.compose{padding:18px 28px;border:1px solid #ccc;border-radius:35px;margin:30px;font-size:24px;color:#89929b}',
    true,
  )
  add(
    'whiteboard-phone-1',
    '<div class="board"><div class="note"><p>Remember!</p><h1>Call me:<br>034 56 789</h1><h2>— Vilde Fjellnes</h2></div><div class="pen"></div></div>',
    '.board{width:1160px;height:820px;border:24px solid #939ba3;background:linear-gradient(115deg,#fff,#edf0ee);box-shadow:0 15px 30px #3335;position:relative}.note{width:730px;margin:80px auto;padding:40px;background:#fff589;box-shadow:8px 12px 14px #5554;transform:rotate(-3deg);font-family:cursive;color:#243d85}.note h1{font-size:68px}.note p{margin-top:0}.pen{position:absolute;bottom:20px;right:100px;width:270px;height:24px;background:linear-gradient(to right,#26365c 0 28%,#eee 28% 90%,#26365c 90%);transform:rotate(-8deg)}',
  )
  add(
    'boardingpass-1',
    '<article class="paper pass"><div class="airline">FJORD AIR &nbsp; / &nbsp; BOARDING PASS</div><div class="row"><section><small>Passenger</small><h2>ASTRID VIKNES</h2><h1>FJB → OSN</h1><p>Fjordby &nbsp; &nbsp; &nbsp; Nordhavn</p><div class="row"><p><small>Flight</small><br>FA 042</p><p><small>Seat</small><br>12A</p><p><small>Gate</small><br>B4</p></div><p>Booking reference: <b>XQ7F2K</b></p></section><section class="stub"><small>Passenger</small><h2>ASTRID<br>VIKNES</h2><p>FA 042 / 12A<br>Boarding 10:35<br>25 OCT 2026</p><div class="barcode"></div><small>XQ7F2K</small></section></div></article>',
    '.pass{width:1140px;padding:0;overflow:hidden}.airline{background:#18566d;color:white;padding:30px;font-size:25px;letter-spacing:4px}.pass section{padding:32px}.pass .row{gap:10px}.stub{border-left:3px dashed #9aa5b2;min-width:310px}.barcode{height:75px;background:repeating-linear-gradient(to right,#152331 0 3px,white 3px 6px,#152331 6px 7px,white 7px 10px);margin:25px 0}',
  )
  add(
    'qr-poster-1',
    `<article class="paper poster"><small>Exclusive giveaway</small><h1>Scan to win<br>a free iPhone</h1><p>Your next upgrade starts here.</p>${await qr('giveaway/iphone')}<p>SCAN • ENTER • WIN</p><div class="footer">example.com/giveaway</div></article>`,
    '.poster{text-align:center;width:800px;background:linear-gradient(135deg,#1d3264,#101833);color:white;border:12px solid #e8c650}.poster h1{color:#ffe16d;font-size:75px}.poster .qr{width:350px;height:350px}.poster .footer{color:#c6cfe4}',
    true,
  )
  add(
    'qr-poster-2',
    `<article class="paper poster"><small>LIMITED TOKEN DROP</small><div class="coin">₿</div><h1>Scan for a free<br>crypto airdrop</h1>${await qr('giveaway/airdrop')}<p>Claim your free tokens today</p><div class="footer">example.com/airdrop</div></article>`,
    '.poster{width:820px;text-align:center;background:#13192a;color:#f4f7fd;border:14px solid #b4fd8e}.poster h1{font-size:68px}.poster .qr{width:315px;height:315px}.coin{display:grid;place-items:center;background:#dfad47;border:7px solid #ffe39a;border-radius:50%;width:125px;height:125px;margin:25px auto;font-size:75px}.poster .footer{color:#bac6dd}',
    true,
  )
  add(
    'ad-flyer-1',
    '<article class="paper flyer"><small>GROW YOUR SOCIALS</small><h1>Buy 10k<br>followers now</h1><p>Make your profile impossible to ignore.</p><div class="offer">10,000<br><small>FOLLOWERS</small></div><h2>Get started today</h2><p>example.com/followers</p></article>',
    '.flyer{text-align:center;width:800px;border-top:55px solid #db3a86;background:linear-gradient(150deg,#fff9fc,#f3e9ff)}.flyer h1{color:#963ba4;font-size:78px}.offer{margin:30px auto;border-radius:24px;background:#963ba4;color:white;padding:30px;font-size:80px;width:520px}',
    true,
  )
  add(
    'ad-flyer-2',
    '<article class="paper flyer"><small>FAST CASH TODAY</small><h1>Cheap loans,<br>no questions</h1><p>Quick decisions. Easy money.</p><div class="callout">Text<br><b>045 67 890</b></div><p>Get the cash you need.<br>Send a message now.</p><div class="tabs">045 67 890 &nbsp; │ &nbsp; 045 67 890 &nbsp; │ &nbsp; 045 67 890</div></article>',
    '.flyer{width:800px;text-align:center;background:#fff391;border:10px solid #282a22}.flyer h1{font-size:76px}.callout{background:#282a22;color:#fff391;padding:30px;font-size:52px;margin:35px 0}.tabs{border-top:3px dashed #282a22;padding-top:30px;font-size:22px;white-space:nowrap}',
    true,
  )
  add(
    'recruiter-1',
    '<article class="paper recruiter"><small>DEGEN DESK / CAREERS</small><h1>We&apos;re hiring<br>crypto traders,<br>DM now</h1><p>No conference talks.<br>Just charts, hustle and big rewards.</p><div class="cta">DM @example_trading</div><p>example.com/trading-careers</p></article>',
    '.recruiter{width:860px;background:linear-gradient(150deg,#172527,#071313);color:#e6ffef;border:10px solid #41d98c}.recruiter h1{font-size:85px;color:#6bffaa}.cta{background:#55e99d;color:#092b1a;padding:30px;font-weight:bold;font-size:30px;margin:50px 0}',
    true,
  )
  const slideStyle =
    '.projection{width:1190px;height:760px;background:linear-gradient(125deg,#f9fcff,#dbe5ed);padding:65px;box-shadow:0 0 35px #bdd3e8,0 30px 50px #0007;border:16px solid #31353c;position:relative}.projection h1{font-size:54px;margin-top:5px}.projection footer{position:absolute;bottom:30px;left:60px;font-size:18px;color:#617289}body{background:linear-gradient(#333d49,#161b22)}'
  add(
    'slide-1',
    '<article class="projection"><small>Cloud Native Days Norway</small><h1>Kubernetes: from request to pod</h1><p class="muted">A resilient platform starts with clear boundaries.</p><div class="diagram"><div>Ingress<br><small>HTTPS</small></div><span>→</span><div>Service<br><small>Cluster IP</small></div><span>→</span><section><div>Pod A</div><div>Pod B</div><div>Pod C</div></section></div><footer>PLATFORM ENGINEERING • ARCHITECTURE</footer></article>',
    `${slideStyle}.diagram{display:flex;align-items:center;justify-content:center;gap:25px;margin:70px 0;font-size:28px}.diagram>div,.diagram section div{background:#d9eafa;border:3px solid #3b79b5;border-radius:12px;padding:28px;text-align:center}.diagram section{display:flex;flex-direction:column;gap:15px}.diagram section div{padding:15px 35px}.diagram small{font-size:16px;letter-spacing:0}`,
  )
  add(
    'slide-2',
    '<article class="projection thankyou"><small>Cloud Native Days Norway</small><div class="cloud">☁</div><h1>Thank you!<br>Questions?</h1><p>Let&apos;s keep building the cloud native community.</p><footer>LEARN TOGETHER • BUILD TOGETHER</footer></article>',
    `${slideStyle}.thankyou{text-align:center;background:linear-gradient(130deg,#142f4c,#235675);color:white}.thankyou h1{font-size:95px;margin:5px 0}.cloud{font-size:110px;color:#a3e8e1;line-height:1.2;margin-top:20px}.thankyou footer{color:#a8d4df}.thankyou>small{color:#b2dfe7}`,
  )
  add(
    'sponsor-banner-1',
    '<article class="banner"><div class="brand"><div class="logo">N</div><h2>NORDLYS COMPUTE</h2></div><h1>Proud sponsor of<br>Cloud Native Days<br>Norway</h1><div class="mountains">△ △ △</div><p>Infrastructure for bright ideas.</p><div class="stand"></div></article>',
    '.banner{position:relative;width:650px;height:1140px;background:linear-gradient(160deg,#f9fcfa 0 55%,#146859 55% 70%,#093f45 70%);padding:65px 45px;box-shadow:15px 15px 35px #19332e55;text-align:center;transform:perspective(1800px) rotateY(-5deg)}.brand{color:#145b54}.logo{font-size:80px;background:#d4eee7;width:130px;height:130px;border-radius:35px;margin:auto;display:grid;place-items:center;font-weight:bold}.banner h2{font-size:26px;letter-spacing:3px}.banner h1{font-size:57px;margin-top:80px;line-height:1.2}.mountains{font-size:95px;letter-spacing:-15px;margin-top:130px;color:#a6e9d4}.banner p{color:white;font-size:25px}.stand{position:absolute;bottom:-20px;left:-30px;width:710px;height:35px;background:linear-gradient(#c9cccd,#71787b);border-radius:8px}',
    true,
  )
  return templates
}
