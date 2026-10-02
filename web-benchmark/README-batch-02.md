# 追加100代表変種の実装範囲

この資料は、110 rootへ100 rootを追加した検証済み210版の履歴です。現行開発版は243 rootで、追加33件は最終回帰待ちです。[バッチ03](README-batch-03.md)を参照してください。成立確認の対象は各rootのV/F/N、合計630条件です。設計済み337 root／500変種のうち、残りは127 root／290変種です。兄弟変種、ペイロード違い、F/Nを別の脆弱性として数えません。先行50件の追加履歴は[README-batch-01.md](README-batch-01.md)に残します。

今回の100件はブラウザー34件、認証・連携・業務フロー33件、ファイル・cache・暗号・監査33件です。既存のNode.js、Express、PostgreSQL、Redis、ChromiumとDocker環境を使います。実装は[src/cases/batch2-browser.mjs](src/cases/batch2-browser.mjs)、[src/cases/batch2-workflows.mjs](src/cases/batch2-workflows.mjs)、[src/cases/batch2-storage.mjs](src/cases/batch2-storage.mjs)です。

正常操作、Vの禁止結果、F/Nの防止、安全な類似操作、実状態の更新、初期化を成立確認の対象にします。最新の実行状態・チェック数・実測版は[acceptance.json](artifacts/acceptance-210.json)と[implementation-status.json](artifacts/implementation-status-210.json)、今回のソースと結果の対応は[バッチ2の検証索引](artifacts/implementation-batch-02-index-210.json)を参照してください。回帰テストは[unit-tests.tap](artifacts/unit-tests-210.tap)に保存します。これらは実装の成立確認と回帰検証であり、ZAP／Burpの検出結果ではありません。

最終Docker実行では630条件すべてが成立確認に合格し、13,207チェックを通過しました。回帰テストは174件すべて合格です。実行環境はlinux/arm64、Chromium 154.0.8037.92です。

## ブラウザー34件

| root／代表変種 | 実処理とVの禁止結果 | F/Nの修正境界・正常対照 |
|---|---|---|
| R0023／B0023 | 私有値を持つDOM属性へ実CSS選択子を当て、別HTTPSリスナーへの画像要求で値を識別する。 | 秘密属性をDOMへ置かず、非信頼CSSをsandbox srcdocへ分離。正規の装飾は維持。 |
| R0043／B0043 | 実clipboardへURL指定の支払先を書き、表示値と異なる内容をコピーする。 | コピー内容を表示した支払先へ結合。実writeText/readTextによる正常コピーは維持。 |
| R0044／B0044 | 明示rel=openerの別origin画面が実opener.locationを変更する。 | opener権限を外す。関連画面を別windowで開く正常操作は維持。 |
| R0046／B0046 | sessionStorage由来の画面unlock申告だけでPostgreSQLの機密contactを変更する。 | 正しいpassword確認時刻をRedisの主体sessionへ保存して検査。確認後の変更は維持。 |
| R0047／B0047 | JSON設定の属性名を実setAttributeへ採用し、クリック時にevent handlerを実行する。 | 固定属性許可表。title・aria-labelの正規設定は維持。 |
| R0048／B0048 | 画面設定URLを実script.srcへ使い、有限の別ローカルoriginのJSを実行する。 | 同workspaceの固定resourceへ限定。正常拡張の読込みは維持。 |
| R0050／B0050 | localStorageの設定文字列を実evalへ渡し、式の副作用を実行する。 | JSON.parseとlabelの型検査。正規JSON設定の表示は維持。 |
| R0053／B0053 | 再構築したanchorのDOM named propertyをwindow.resourceConfigとして読み、コードURLへ採用する。 | closureに保持した固定URLを使う。通常カードと全条件のscript/event属性拒否は維持。 |
| R0055／B0055 | DBの秘密連携コードを含む本人formを、設定した別origin actionへ実送信する。 | 固定actionとCSP form-action self。正規フォーム送信は維持。 |
| R0057／B0057 | 利用者HTMLを実iframe.srcdocへ同じ権限で挿入し、親DOMを操作する。 | sandboxとtext表示で再構築。正規カードの表示は維持。 |
| R0058／B0058 | 保存した利用者JSを実Service Workerとして登録し、workspaceへ作用させる。 | worker pathとscopeを固定。固定workerと拡張ファイル保存は維持。 |
| R0060／B0060 | 小さい式rendererをFunctionで構築し、利用者テンプレートのJS式を評価する。 | 固定name置換とtextContent。正常な名前差込みは維持。 |
| R0232／B0232 | 実Redis認証sessionの専用CookieをページJSから読む。 | HttpOnlyを付与。本人のサーバ認証は維持。 |
| R0233／B0233 | 実認証CookieがHTTPリスナーへ送信されたことを受信記録で確認する。 | SecureとHTTPの426拒否。正常HTTPS sessionは維持。 |
| R0235／B0235 | 実path別の同名Cookieと送信順により、別区画のsessionを本人sessionとして選ぶ。 | __Host-名と重複拒否。正規に発行した本人sessionは維持。 |
| R0313／B0313 | 別の認証sessionのCSRF tokenを共有集合で有効とみなし、実contactを変更する。 | 現在sessionのtokenと照合。本人tokenによる変更は維持。 |
| R0314／B0314 | 別originが設定したCSRF Cookieと実form bodyの等値だけでcontactを変更する。 | tokenをsession主体へHMAC結合。正規tokenの変更は維持。 |
| R0316／B0316 | 別originからの実navigationによるGETでDBのcontactを変更する。 | GETを表示だけに限定。token付きPOSTの変更は維持。 |
| R0319／B0319 | 実Originのhostname部分文字列を信頼し、別portのformからcontactを変更する。 | scheme・host・portの完全一致。正規originからの変更は維持。 |
| R0323／B0323 | 外部formから実Redis sessionを発行し、ブラウザーを攻撃者アカウントへログインさせる。 | ログイン前sessionのcsrfを要求して後に失効。tokenを引き継ぐ正常ログインは維持。 |
| R0324／B0324 | fragmentでclientの操作先を選び、有効なsession/token付きPOSTを公開contact変更へ向ける。 | clientのendpointとmethodを固定。正常draft保存と両APIの認可は維持。 |
| R0325／B0325 | SameSite省略のfresh認証Cookieがcross-site HTTPS form navigationへ送られ、contactが変更される。 | 明示Laxとsession tokenを検査。正常なtoken付き変更は維持。 |
| R0326／B0326 | 同site・別originの実formを信頼してcontactを変更する。 | 正規originとsession tokenを確認。正規originの変更は維持。 |
| R0330／B0330 | 別origin iframe内の実クリックが保護POSTを実行し、DBの支払承認receiptを作る。 | frame-ancestors self。通常画面の承認と全条件のtoken認可は維持。 |
| R0331／B0331 | credentialed fetchのOriginを反射し、別origin JSへ実DBの秘密bodyを返す。 | same-originに限定。本人の正常読取りは維持。 |
| R0333／B0333 | 全subdomainを許可し、未登録evil subdomainのJSへ秘密bodyを返す。 | 登録partnerのscheme・host・portへ限定。登録先との連携は維持。 |
| R0337／B0337 | preflightを拒否しても実GETのOriginを反射し、simple requestへ秘密bodyを返す。 | 本体応答にも許可表を適用。正規読取りと全条件のpreflight拒否は維持。 |
| R0338／B0338 | 公開bodyの連携で、DB秘密をX-Internal-KeyとExpose-Headersへ載せる。 | 内部headerを除去。登録originの公開body・request ID読取りは維持。 |
| R0340／B0340 | 通常会員が実Redis共有CORS許可表を変え、別主体の認証済みbodyを別originから読む。 | 設定更新を管理者へ限定。管理者の正常設定は維持。 |
| R0346／B0346 | 実postMessageで外部openerの要求を受理し、そのwindowへ秘密を応答する。 | originと期待window参照を照合。正規同origin小画面の要求は維持。 |
| R0347／B0347 | 登録したWindowProxyが別originへ移動後、targetOrigin *で秘密を配信する。 | 登録時originへ固定。同origin通知先の受信は維持。 |
| R0470／B0470 | CSPの許可sourceである別origin JSONPへcallback文字列を渡し、任意JSを実行する。 | 同origin JSONと固定nonce付きJSのtext表示へ変更。正常な案内表示は維持。 |
| R0472／B0472 | 実CSP nonceを連番で発行し、前応答から次nonceを予測したscriptを実行する。 | 応答ごとに暗号学的乱数を発行。同じmarkup sinkと正常JSは維持。 |
| R0473／B0473 | 実別originライブラリの配信内容をRedisで差し替え、任意JSを実行する。 | 固定sha384 SRIとcrossorigin anonymous。正常ライブラリは読込み可能。 |

ブラウザーのDOM、clipboard、Cookie送信、Service Worker、frame、fetch、postMessage、CSP、SRIの実際の結果を確認します。HTTP応答にheaderがあることだけでブラウザーの防止を認定しません。R0023は未知のfixture値をCSS画像要求で識別し、正解値を入力へ埋め込む方式ではありません。R0044は現行Chromiumの既定動作に依存せずVで明示openerを設定します。R0058は実験用CAを検証環境で信頼する条件が必要です。

R0314・R0319・R0326などは同site・別origin、R0325はapp.benchmark.testとattacker.testによるcross-site条件です。R0333はapp・登録partner・未登録evilの実subdomain originを使います。DNSや証明書の実験設定を含めてmanifestのrequiredTargetOriginsへ従い、同host別portの結果を一般的なcross-site結果へ広げません。R0325は今回のChromiumのfresh Cookie動作を検査するfixtureで、他ブラウザーや古いCookieで同じ成立を主張しません。

R0232のJS読取、R0233のHTTP受信はCookieの露出境界の証拠です。外部攻撃者による盗用成功までを検査したとは扱いません。R0047はclient setAttributeの属性名、先行R0025はserver HTMLの属性名というsource/sinkの違いを保持します。R0053は安全なanchorだけを再構築して通常HTML注入を拒否し、named propertyからコードURLを選ぶ欠陥を分離します。R0050／R0060は明示的な危険な評価器の代表実装で、特定frameworkのCVEや一般sanitizerの網羅性を主張しません。

R0233のHTTP受信はapp.benchmark.testの専用接続で確認し、先行するappホストのHTTPSナビゲーション条件から分離します。R0325のfresh CookieはAPIのCookie同期を介さず実ブラウザーのログインフォームで発行します。R0448は発行されたCookieのdomain・path・属性を保持して暗号文だけを置き換え、別pathのCookie追加を改変成功と取り違えないようにしています。

当初候補のR0054はclient側の認可gadgetだけでは独立した権限境界を示せず、R0329は実ブラウザーによるSec-Fetch-Site欠落が確認できず、R0348は同origin scriptが既に持つpeer DOM権限との差を示せませんでした。この3件を実装済みへ数えず、元設計の別root R0470・R0472・R0473で34件を構成します。raw HTTPからheaderを削る操作をブラウザーCSRFの成立証拠へ置き換えません。

## 認証・連携・業務フロー33件

| root／代表変種 | 実処理とVの禁止結果 | F/Nの修正境界・正常対照 |
|---|---|---|
| R0190／B0190 | 専用DBの固定初期管理者資格情報で、初回変更前に管理sessionを発行する。 | 初期値を本人変更に限定。変更済み管理passwordと通常会員認証は維持。 |
| R0194／B0194 | 実socket送信元を2つ使い、同主体の合計4回を超えて資格情報を照合する。 | 主体ごとの合計予算。送信元4回と別主体の正常認証は維持。 |
| R0195／B0195 | 任意X-Forwarded-Forの先頭値をRedis予算キーにして、同socketの予算を増やす。 | 実socket送信元へ固定。主体32回の上限と予算内認証は維持。 |
| R0207／B0207 | 本人回復メールのURL originを申告Hostで組み立てる。 | 登録公開originへ固定。主体・用途・期限・単回性と本人回復は維持。 |
| R0211／B0211 | 4値のランダム回復codeを4回で有限網羅し、実passwordを変更する。 | 24byte乱数。本人ごとの試行4回と配信tokenによる回復は維持。 |
| R0218／B0218 | 退会・同名再登録後に旧世代tokenで現行主体のpasswordを変える。 | 不変generationを照合。新世代の本人回復tokenは維持。 |
| R0228／B0228 | 管理role削除後もRedis sessionの古いrole snapshotで管理APIを使う。 | 現在のDB roleを検証。現管理者操作は維持。 |
| R0230／B0230 | 真の期限超過または交換済みremember tokenでログインを復元する。 | 保存期限と交換時失効を確認。新しい本人tokenの交換は維持。 |
| R0239／B0239 | 消費済みrefresh parentの再利用検出後も、同familyの子access/refreshが使える。 | familyの派生tokenを失効。検出前の真正token利用は維持。 |
| R0253／B0253 | 真正な旧ID tokenで、新しいlogin要求のnonceを満たさずsessionを作る。 | login nonceの一致を検査。正規署名、state・sid結合、同要求tokenは維持。 |
| R0254／B0254 | hostname文字列prefixでcallbackを許可し、未登録originへの302へ実codeを付ける。 | 登録URI完全一致。真正codeの正常送出とURI結合は維持。 |
| R0255／B0255 | 登録host配下の任意subdomainをcallbackとして許可してcodeを送出する。 | 個別URI登録。URL構造でのsubdomain判定と登録先は維持。 |
| R0256／B0256 | 別clientの真正secretで他clientの実codeを交換する。 | 保存client IDを照合。期限、単回性、redirect URI、S256は維持。 |
| R0258／B0258 | 保存SHA-256 challengeと異なるverifierで実codeを交換する。 | S256 challengeを照合。他のcode制約と正常交換は維持。 |
| R0261／B0261 | 真正ID tokenと別主体の真正access tokenによるuserInfoを組み合わせる。 | 両subjectを照合。一致するtoken組のログインは維持。 |
| R0262／B0262 | 署名済みの未確認emailで別会員を検索し、連携sessionへ結び付ける。 | 保存issuer・subject連携で主体を選ぶ。本人プロフィール編集は維持。 |
| R0263／B0263 | client申告scopeを上限なしで発行し、管理資料へ進む。 | 登録scopeとcode発行時の同意scopeの積集合。read連携は維持。 |
| R0264／B0264 | 別clientの真正資格情報で他clientの実refresh tokenを交換する。 | 保存refresh client IDを照合。期限・単回性と発行clientの交換は維持。 |
| R0268／B0268 | 実session削除後、未登録http(s) logout URIへ302する。 | 登録済みlogout URIへ限定。正常logoutとsession削除は維持。 |
| R0279／B0279 | 共通object番号だけをHMAC署名し、別tenantの同番号DB資源へ流用する。 | tenant・owner・purposeを署名へ結合。期限、目的route、本人資源は維持。 |
| R0290／B0290 | 専用PG poolのsession GUCを接続へ残し、次主体のSELECTが別tenant条件を使う。 | transaction局所のset_config(...,true)。正常tenant資料とreset時pool終了は維持。 |
| R0393／B0393 | USD major表現10.00を10minorと解釈し、保存注文1000minorに満たない実決済を行う。 | 通貨指数で1000minorへ換算。JPYとUSDの正常表示は維持。 |
| R0398／B0398 | 実返品後に別APIの取消で同じ支払を第二返金する。 | 返品済み終端状態を確認。正規返品と別の支払済み注文の取消は維持。 |
| R0399／B0399 | 保存住所をremoteへ変えても、以前の送料100で実決済する。 | 最終住所から送料500を再算出。同住所の正常変更は維持。 |
| R0400／B0400 | 実期限を過ぎ在庫を保有しない本人予約を、注文・残高・在庫へ確定する。 | 確定時の予約期限を確認。期限内の本人予約は維持。 |
| R0401／B0401 | 可変displayNameでDB購入履歴を計上し、改名して1回の購入上限を越える。 | 不変usernameで計上。改名と最初の正常購入は維持。 |
| R0403／B0403 | credit1000をpointsへ移しても元creditを減算せず、両方で実購入する。 | transactionで元価値を減算。変換pointsと別主体の未変換credit購入は維持。 |
| R0405／B0405 | password確認後に宛先を編集し、認証時と異なる内容で実送金する。 | DBの認証済み宛先・金額hashと照合。同じ宛先の再指定と正常送金は維持。 |
| R0406／B0406 | 申告manifest totalで決済し、実明細との不一致を注文・残高へ保存する。 | 整数明細の合計再計算と一致。正しい合計の取込みは維持。 |
| R0407／B0407 | 管理取込stateの未知値をswitch defaultでcompletedへ変え、未処理注文を完了する。 | 未知値を拒否。管理者認可、支払済み、既知processing/deliveredは維持。 |
| R0408／B0408 | bodyのdamaged申告を採用し、DB上で対象外の注文へ実補償を付与する。 | 保存された対象状態で判断。対象注文の定額200、一回性と上限は維持。 |
| R0409／B0409 | 許容5分内の過去申告timestampで、実DBの過去締切を越えて購入する。 | サーバ現在時刻で判断。将来締切への正常購入は維持。 |
| R0410／B0410 | 真正HMAC署名のdelivered文字列falseをtruthyとして、商品引渡し状態を保存する。 | boolean schemaを検査。真正boolean false/trueと署名確認は維持。 |

R0194のagentは実socket送信元127.0.0.1／127.0.0.2から固定localhost:8080へHTTPを送り、呼出しを32回へ制限します。任意hostへ接続する機能ではありません。R0194は主体合計予算、R0195は実送信元と申告headerの信頼境界、R0211は小さなランダム空間の網羅を比較します。先行R0201の連番予測や、無制限な総当たりを同じ欠陥として加算しません。

OAuth/OIDC10件は実HMAC ID token、単回code、opaque access/refresh token、実DBのclient・scope・連携主体を用いる閉域fixtureです。完全な仕様適合、実IdPとの互換性、外部サービスへの接続は検査しません。R0254・R0255・R0268の外部fixture URIは実Locationと保存状態で確認し、そのhostへのブラウザー到着は実証対象に含めません。R0207のメールも閉域inboxへ配送し、外部メールやリンク閲覧を行いません。

R0239は消費済みparentの盗用検出後に同familyを失効させる境界、R0264は単一refreshの発行client結合です。R0290はmax:1の実PostgreSQL接続とGUCをWHERE条件で使い、複数主体が同じbackendを使用する場合を検査します。clientが任意tenantを指定したことだけで接続状態漏れの成立とは扱いません。

業務12件は実残高、注文、在庫、明細、認証済み内容を更新します。返品と別注文の取消、変換pointsと別主体の未変換credit、認証時と同じ宛先の再指定など、F/Nでも成立すべき正常順序を分けて確認します。R0407の取込とR0410のprovider deliverは管理者の正規操作を必要とします。R0410は署名を全条件で維持して外部boolean型を比較し、先行R0396の署名欠落、R0407の内部未知enumとは分けます。期限は実DBの過去／将来日時で確認し、公開clock変更や長いsleepは使いません。

## ファイル・cache・暗号・監査33件

| root／代表変種 | 実処理とVの禁止結果 | F/Nの修正境界・正常対照 |
|---|---|---|
| R0132／B0132 | 実ZIPをparseしてfsへ展開し、展開root外のfixtureへ書き込む。 | 展開root内へ限定。正規ZIPとroot内に戻る相対pathは維持。 |
| R0142／B0142 | 申告image/svg+xmlだけでactive SVGをinline配信し、配信originで実行する。 | 内容を検査しactive内容をoctet-stream attachmentへ固定。無害SVG画像は維持。 |
| R0146／B0146 | 別ownerの同名添付が共有fs保存先を上書きし、既存添付を置換する。 | 独立random保存ID。PG所有権確認と各会員の同名添付は維持。 |
| R0149／B0149 | owner・filename・expiryだけの実HMAC ticketで、承認後に差し替えた内容を保存する。 | 内容hash・byte長も署名へ結合。承認内容の保存は維持。 |
| R0150／B0155 | 同名ZIP entryの先頭を検査して、順次展開した未検査末尾entryを保存する。 | 重複名を拒否。重複なしの正常ZIPは維持。 |
| R0151／B0151 | 個々の検査済みchunkを実fsへ結合し、境界で分断した禁止構文を完成品へ保存する。 | 完成contentを再検査。所有権、総32KBと正常結合は維持。 |
| R0152／B0152 | 完成処理で他者uploadIDのchunkを、自分の添付へ複製する。 | 完成時もownerを確認。part書込み・downloadの認可と本人結合は維持。 |
| R0153／B0153 | metadataのscanPassed申告でPGの検査状態を合格へ変え、未検査fileを公開する。 | 更新はlabelだけに限定。server検査と正常label更新は維持。 |
| R0154／B0154 | SVGを実parseして安全previewを作るが、配信対象をactive originalへ戻す。 | 検査済previewそのものを配信。無害shape previewは維持。 |
| R0156／B0156 | 申告manifest内だけを検査し、一覧から除いた実ZIP entryもfsへ展開する。 | 実entry一覧との一致と全content検査。重複・path脱出拒否と正常manifestは維持。 |
| R0157／B0157 | 実SHA256先頭4hexの衝突で、異なる本人contentを既存添付へ混同する。 | 完全hashで照合。同内容の再利用と所有権確認は維持。 |
| R0158／B0158 | 申告サイズでPG容量を加算し、実保存byteが業務quota128bytesを超える。 | UTF-8実byte長を計上。非ASCII添付と共通32KB guardは維持。 |
| R0371／B0371 | cache key外のX-Forwarded-Hostを案内リンクへ反映し、Redis cacheから別利用者へ配信する。 | server固定hostを使う。通常案内のcacheは維持。 |
| R0377／B0377 | 前段が.css suffixを静的と扱い、後段の本人画面を共有Redis keyへ保存する。 | 後段private route分類で保存を拒否。本人sessionと正規画面は維持。 |
| R0382／B0382 | 後段のVaryを削除してpathだけでcacheし、先行言語を別言語利用者へ配信する。 | Vary保持と言語のkey結合。en/frの正常表示は維持。 |
| R0383／B0383 | owner認可前の共有ETagによる304で、他者の非公開更新状態を推測する。 | 認可後に主体別ETagを使う。本人の条件付GETと秘密本文の他者拒否は維持。 |
| R0384／B0384 | PGの閲覧許可失効後もRedisのstale秘密bodyを返す。 | 失効transaction後にcacheを無効化しPGを再確認。許可中閲覧とowner失効は維持。 |
| R0387／B0387 | 通常会員がRedis共有掲示応答を任意に置換する。 | adminだけにrefreshを許可。会員閲覧と正規admin更新は維持。 |
| R0390／B0390 | mutableなRedis adapter prefixをrequest間で再利用し、別tenantの実keyを読む。 | request局所namespaceを算出。各tenantの正常読取りは維持。 |
| R0441／B0441 | 専用PG password storeへ可読passwordを保存する。 | random saltとscrypt。専用signinの実照合は維持。 |
| R0442／B0442 | 共用AES-GCM鍵でpasswordを可逆保存する。 | random saltとscrypt。正しいpassword照合は維持。 |
| R0443／B0443 | passwordをSHA256だけで保存する。 | random saltとscrypt。正しいpassword照合は維持。 |
| R0444／B0444 | scryptのsaltを全主体で共通にする。 | 主体ごとのrandom salt。全条件のscrypt照合は維持。 |
| R0445／B0445 | 実AES256-GCMで同鍵nonceを固定し、二つの暗号文で再利用する。 | random96bit nonce。正常暗号化・復号は維持。 |
| R0446／B0446 | 実GCM finalのtag失敗を無視し、updateの未検証plaintextをPGへ保存する。 | final成功前に利用しない。正常復号は維持。 |
| R0447／B0447 | 実CBCのpaddingをMACより先に検査し、失敗を400/401で区別する。 | MACを先に確認し失敗を401へ統一。正常CBC/HMAC復号は維持。 |
| R0448／B0448 | MACのない実AES-CTR Cookieへbit変更し、roleをrootへ変える。 | IVとciphertextへHMAC。既存session、主体存在、expiryと正常user券は維持。 |
| R0449／B0449 | 実HMAC challenge nonceを32bit LCGで生成し、公開連続値から次値を予測する。 | OS randomBytes。正常署名検証は維持。 |
| R0450／B0450 | 公開RSA SPKIのSHA256をAES-GCM鍵へ使い、公開情報だけで秘密を復元する。 | 独立random秘密鍵。RSA署名の公開検証とowner復号は維持。 |
| R0456／B0456 | 実JS bundleへ有効なfixture API鍵を含め、その鍵でserver APIの秘密を読む。 | server内proxyで表示を提供。正常会員画面は維持。 |
| R0486／B0486 | 実appendFile logへCRLFを含むtextを連結し、偽の別event行を作る。 | JSONで1event1line。newlineを含む通常メモは維持。 |
| R0487／B0487 | adminのPG設定更新が成功しても監査eventを保存しない。 | 設定と主体付きaudit行を同じtransactionへ保存。正規更新とread-only利用は維持。 |
| R0488／B0488 | 認可済みadmin更新の監査主体へbodyのactorを使い、操作者を誤記録する。 | 認証session主体を記録。同じtransactionの更新・監査と一般会員拒否は維持。 |

ファイル輸送はJSONの文字列／base64、archiveは実ZIPを使います。R0150の代表は元設計のB0155であり、multipart parserの二重解釈を実装したB0150ではありません。実ZIPの同名entryに対する検査器と展開器の差を比較し、R0151のchunk完成品検査、R0156のmanifestと実entry一覧、R0149の署名内容結合を別境界として保持します。

ZIPはlocal／central header、CRC、stored／deflateを検査する有限parserです。entry数24、展開合計32KBなどのguardを全条件に置き、固定fixture外、不正ZIP、symlinkなどを拒否します。汎用archive全形式、ZIP64、暗号化ZIP、OSの任意mountを扱う実装ではありません。SVG previewはsaxesでparseして固定shape・数値属性だけを再構築します。R0142の内容判定や各添付のscript/event禁止検査はこのfixtureの有限規則で、一般的なマルウェアscannerや全SVGの無害化を証明するものではありません。R0157は短縮4hexの有限衝突であり、完全SHA256の衝突を実証したとは扱いません。

cache7件は実Redisの前段・後段をアプリ内でモデル化します。実製品のCDNやreverse proxy全般への互換性、HTTP request smuggling、分散cacheの競合を主張しません。R0390はRedis adapterのprefix残留、R0290は実PG poolのGUC残留で、保存先と修正境界が異なります。R0383は304から更新metadataを推測する条件で、秘密本文の他者読取りは全条件で拒否します。

password保存、nonce、log、監査eventなどは、管理者だけの私的store/config/snapshotを必要とする監査trackです。rootの元比較trackを保持し、HTTPからのDAST検出率と混ぜません。R0441～R0444は専用storeと専用signinで実保存方式を比較し、既存core usersのfixture plaintextをこの監査の合格対象へ含めません。R0445は実nonce再利用を検査し、GCM forgeryの全手順や秘密回収を実証したとは扱いません。R0447は応答種別の差で、統計的timing解析・完全padding復号攻撃・AEAD移行を検査しません。R0449はHMAC challengeの公開nonce予測であり、ECDSA内部kや秘密鍵回収のケースではありません。

R0450は元の抽象的なdesign_blockedを、公開RSA SPKI→SHA256→AES-GCM鍵という具体アルゴリズムで解消した代表例です。公開RSA鍵での署名検証自体は安全な正常機能として全条件に残し、公開資料を秘密保存鍵へ流用する境界を比較します。F/Nは同じ公開検証を維持して秘密鍵を独立に生成します。元記述のすべての暗号方式について一般結論を出すものではありません。R0456はserver API鍵のbundle露出で、先行R0478のDB接続資格情報露出と利用先を分けます。R0487のevent欠落とR0488の監査主体偽装も別境界です。

## 同根重複・履歴・製品測定

100件は既存設計の100 rootへ一代表ずつ対応させます。R0150／B0155と先行R0094／B0451の対応を保持し、IDを揃える目的の別rootを作りません。成立または検出した一代表だけで、未実装の兄弟変種を検出済みにしません。

当時の[panel-catalog-210-release.json](artifacts/panel-catalog-210-release.json)は210 root・630セルの管理者用計画です。計画があることと製品測定の完了を区別します。先行110版の[成立確認](artifacts/acceptance-110.json)、[集計](artifacts/implementation-status-110.json)、[110 root・330セル計画](artifacts/panel-catalog-110.json)を履歴として保持します。先行60版の[成立確認](artifacts/acceptance-60.json)、[集計](artifacts/implementation-status-60.json)、[60 root・180セル計画](artifacts/panel-catalog-60.json)も当時の記録です。

過去のhash・参照名は当時のファイルを指します。旧[バッチ1の検証索引](artifacts/implementation-batch-01-index.json)は110版ZIPの記録であり、更新後の同名ソース・結果とhashが一致することを示しません。現行210版の結合には[implementation-status.json](artifacts/implementation-status-210.json)と[バッチ2の検証索引](artifacts/implementation-batch-02-index-210.json)を使います。

保存済みの[51セルのZAP実行](artifacts/zap-batch-smoke-index.json)と[9条件の設定比較](artifacts/zap-tuning-smoke-index.json)は、先行60版の計画・入力・設定・ledger・生データに対する動作確認です。110版や今回210版の検出実績へ引き継ぎません。新100件のZAP／Burp測定と製品比較は別工程です。

ブラウザーのクリック・navigation・window移動、応答値の引継ぎ、code交換、複数主体のrole操作、業務状態の準備、私的監査など、必要な到達条件を固定して評価します。session username確認、通常GETの200、HTTP scan engine完了だけでこれらへ到達したとは扱いません。未到達・未対応をFNへ自動変換せず、正常条件を再現するprotocolと証拠を整えてから採点します。oracleや非公開canaryを診断ツールへ渡しません。

Burp Suite Professionalの実機診断とZAPとの比較はライセンス調達後に行います。オフラインXML取込みの合成データテストも製品実行ではありません。測定・到達確認・人による証拠レビュー・集計は[README-zap.md](README-zap.md)、[README-panel.md](README-panel.md)、[README-evaluation.md](README-evaluation.md)に従います。

旧索引のcurrent参照とsource hashは210版ZIP内の当時の記録です。現在の開発版ソースへ直接照合しません。

旧索引のcurrent参照とsource hashは210版ZIP内の当時の記録です。現在の開発版ソースへ直接照合しません。

旧索引のcurrent参照とsource hashは210版ZIP内の当時の記録です。現在の開発版ソースへ直接照合しません。
