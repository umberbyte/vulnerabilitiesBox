# 追加50代表変種の実装範囲

この文書は、当時の60 rootの代表60変種へ50 rootを追加した110版の履歴です。当時の成立確認の対象は各rootのV/F/N、合計330条件、未実装分は設計済み337 root／500変種のうち227 root／390変種でした。検証済み210版の追加100件は[README-batch-02.md](README-batch-02.md)を参照してください。root内の兄弟変種、同じ欠陥のペイロード違い、F/Nを別の脆弱性として数えません。

このバッチは認証・回復・セッション17件、認可・業務17件、SQL・ファイル・JWT・数値などの境界16件です。既存のNode.js、Express、PostgreSQL、Redis、Chromiumと同じDocker環境を使用し、プラットフォームや依存パッケージを追加しません。実装は[src/cases/batch-auth.mjs](src/cases/batch-auth.mjs)、[src/cases/batch-authorization.mjs](src/cases/batch-authorization.mjs)、[src/cases/batch-boundaries.mjs](src/cases/batch-boundaries.mjs)に分けています。

正常操作、Vの禁止結果、F/Nの防止、安全な類似操作、実状態の更新、初期化をDocker内の成立確認で検査した110版です。当時の成立確認結果とチェック数は[acceptance-110.json](artifacts/acceptance-110.json)、対象数・実測版・回帰テストとの結合は[implementation-status-110.json](artifacts/implementation-status-110.json)を参照してください。実装数と成立確認数をZAPの検出実績へ置き換えません。

## 認証・回復・セッション17件

| root／代表変種 | 実処理とVの禁止結果 | F/Nの修正境界・正常対照 |
|---|---|---|
| R0183／B0183 | PostgreSQLの登録途中行にあるNULL資格情報を未設定値へ変換し、省略されたpasswordとの比較で実Redis sessionを発行する。 | 必須・非空のpasswordと設定済み資格情報を検査。完全な資格情報での会員認証は維持。 |
| R0185／B0185 | raw Unicode IDで登録・資格情報確認した後、NFKC化した別主体へsessionを解決する。 | 登録と認証で同じNFKC規則とID一意制約を使う。正規の新規登録とcanonical資格情報による認証は維持。 |
| R0187／B0187 | 別人宛に確認メールを送っただけで、申告ドメインによる組織権限をDBへ付与する。 | 宛先・主体・現在の申告メールへ結合したtoken確認後に権限を付与。本人の組織メール確認は維持。 |
| R0188／B0188 | 本人の単回確認tokenと別の登録IDを組み合わせ、別主体のverified属性をDBで更新する。 | tokenの登録主体と更新対象を一致させる。本人の確認と確認済みサービス利用は維持。 |
| R0191／B0191 | 共通の最小長を満たす既知の弱いpasswordを実DBへ登録し、その値で認証する。 | 有限のfixture blocklistにある弱値を拒否。長い別値と正規登録は維持。 |
| R0193／B0193 | 実DBの既存・不存在候補について、資格情報失敗のHTTP状態・本文を分ける。 | 失敗応答を統一。正しい資格情報は利用でき、時間分布の同等性は受入対象に含めない。 |
| R0196／B0196 | Redisのpassword段階markerだけでOTP保護APIの実データを取得する。 | 保護APIでOTP完了段階を検査。本人のOTP完了後のアクセスは維持。 |
| R0197／B0197 | 既存要素の承認なしで実OTP配送先を変え、別人の閉域inboxへ届いたcodeで認証する。 | 変更前のOTPで承認し、旧codeを失効して新宛先へ配信。承認済み変更は維持。 |
| R0198／B0198 | 同じ実OTPで二度目のsessionを発行し、DBに認証完了を再記録する。 | Redis Luaで原子的に単回消費。最初の認証とその後の保護操作は維持。 |
| R0199／B0199 | Aliceの実OTPでBobのpending challengeを完了し、Bobの保護データへ進む。 | OTPを主体とchallengeへ結合。期限、用途、単回性、試行上限は全条件で保持。 |
| R0206／B0206 | 主体行lock下で回復tokenを再発行しても旧tokenが残り、実passwordを変更する。 | 再発行時に同じ主体の旧tokenを失効。新tokenと他主体の有効tokenは維持。 |
| R0210／B0210 | 公開DBプロフィールのcity値だけで実passwordを回復する。 | 本人宛の期限付き単回tokenを要求。正常な秘密tokenによる回復は維持。 |
| R0219／B0219 | 保存された招待roleの代わりに受付bodyのroleを使い、実組織membershipを昇格する。 | 管理者が発行した保存roleを使用。正規の一般・管理者招待は維持。 |
| R0220／B0220 | Bob宛の招待tokenを別メール主体が受け取り、実組織membershipを取得する。 | 宛先と認証主体を照合。正しい宛先の加入、保存role、単回性は維持。 |
| R0225／B0225 | 実Redis sessionの絶対期限が過ぎ、idleだけ更新された状態でも保護データを利用する。 | 絶対期限とidle期限を併用。両期限内の歴史sessionは正常に利用できる。 |
| R0226／B0226 | 絶対期限内でも、最終活動からのidle期限を過ぎた実Redis sessionが継続する。 | 最終活動からのidle期限を検査。絶対期限と活動中sessionは全条件で維持。 |
| R0227／B0227 | 実DB password変更時にRedisの主体session世代を更新せず、保存済み旧sessionが継続する。 | 世代を更新し、新しい有効sessionを発行。現在passwordの照合、正常な新credential、他主体の世代は維持。 |

R0183は通常アカウントと登録途中主体を実DBで区別します。R0185は被害者のpassword上書きを使わず、資格情報を確認した主体とsession主体の不一致を比較します。R0187のメールは実宛先に対応するRedis inboxへ配送し、申告者へ無条件にtokenを返しません。外部メールを送る検証ではありません。

MFA4件は同じ正常な二段階認証を共有し、保護APIの段階、配送先変更の承認、単回消費、主体とchallengeの結合をそれぞれ比較します。汎用`/login`のsessionには専用markerがなく、全条件でこの保護APIへ受理しません。OTPを全探索せず、challengeごとの試行上限を保持します。R0225/R0226は認証済み本人だけが取得できる歴史session fixtureを実Redisへ保存し、期限超過と期限内を確認します。長いsleepや公開clock変更は使いません。

R0191の有限blocklistは一般的な漏えいpassword DBの網羅性を意味しません。R0193は状態・本文の列挙だけを検査し、応答時間による列挙への耐性は確定していません。R0220は有効な招待tokenが取得・転送された前提を記録して比較します。

## 認可・業務17件

| root／代表変種 | 実処理とVの禁止結果 | F/Nの修正境界・正常対照 |
|---|---|---|
| R0272／B0272 | 認可された親URLへ別親の実DB子を指定し、親子文脈が違うデータを取得する。 | 実child.parent_idとURL親IDを照合。親・子それぞれの読取ACLと正しい親子アクセスは全条件で保持。 |
| R0280／B0280 | 実DBのread共有tokenを、同tenantの認証主体が文書更新へ転用する。 | 保存capabilityのwrite権限を検査。公開read共有と明示発行したwrite共有は維持。 |
| R0282／B0282 | 委任元が現在所有する別文書を、委任tokenの対象ID集合外でも代理変更する。 | 許可対象ID集合を照合。代理人、期限、tenant、委任元の現所有権は全条件で保持。 |
| R0283／B0283 | 公開親の継承ACLで、実DBに明示された非公開子ACLを置き換えて読む。 | 明示子ACLを優先。NULLの子ACLが親から継承する正常仕様は維持。 |
| R0285／B0285 | 元文書の所有者が、認可されていない別tenantの実保存先へ文書を移動する。 | 移動先のtenant・write権限を検査。正規の所有文書移動は維持。 |
| R0287／B0287 | 実DBで論理削除した文書が一覧から消えても、通常の直接参照から読める。 | 通常直接参照で削除状態を検査。管理者の正規trash参照と未削除文書は維持。 |
| R0300／B0300 | 外部`X-Internal-Role`を権限として使い、一般会員の実操作履歴へ管理操作を記録する。 | DBの管理者roleで認可。ログイン、本人、固定actionは全条件で保持。 |
| R0301／B0301 | `X-Forwarded-For`の申告loopback IPを管理権限として使い、実管理操作を行う。 | 実会員roleで認可。固定actionと正規管理者操作は維持。 |
| R0303／B0303 | JSON booleanのfeatureFlagを管理権限として使い、実操作を記録する。 | 機能flagを権限に使わず管理者roleを検査。文字列trueや任意actionは許可しない。 |
| R0305／B0305 | PostgreSQLのAND/OR結合優先順位でtenant制約を外れ、別tenantのtenant-public行を読む。 | tenant AND (owner OR public)を適用。同tenantの合法な公開共有は維持。 |
| R0306／B0306 | 実approver roleを持つ本人が自身の申請を承認し、approved_byを保存する。 | 申請者と承認主体を分ける。別の正規approverによる承認は維持。 |
| R0307／B0307 | server保存roleにあるcreator/releaserの競合を無視し、実支払releaseを記録する。 | 使用時に排他的roleの組合せを拒否。競合のない正規releaserは維持。 |
| R0308／B0308 | 管理者が保存した実Redis policyのJSON/schema解析が失敗し、一般会員の認可が許可へ進む。 | 解析・schema障害では拒否。有効policyと正規管理者操作は維持。 |
| R0309／B0309 | 実key hash・期限を検証したread API keyにbody scopeを重ね、実管理操作を行う。 | 保存keyのscopeで認可。正規のwrite keyと本人結合は維持。 |
| R0394／B0394 | 同じorderへcouponを逐次適用し、実保存価格・履歴・残高引落しに割引を重ねる。 | orderごとの重複適用を拒否。初回割引と単回paymentは維持。 |
| R0396／B0396 | 発行元HMACを持たない通知が、実引落しのないorderをpaidにする。 | 支払元通知のHMACを検証。正規の引落し・署名通知、保存額・通貨・単回完了は維持。 |
| R0404／B0404 | 承認後に編集した未承認金額で実残高を引き落とし、orderを記録する。 | 使用時に承認hash/versionと現在内容を照合。編集と独立した再承認による正常支払は維持。 |

認可は実DBの親子関係、capability、委任範囲、明示ACL、保存先、削除状態、role、scopeを比較します。単に「他人のデータ」という症状から同じ欠陥を増やしません。R0272は子ACL自体を全条件で保持し、R0283はNULL継承と明示ACLを区別します。R0305はSQLの値を全条件でbindした論理式の欠陥で、SQL文字列注入とは別の境界です。

R0308では認可された管理者によるpolicy設定ミスを前提に、実JSON/schema例外からの許可を比較します。一般会員がsentinel入力で障害を作るmockは使いません。R0394は逐次の重複割引に限定し、並行実行や負の数量を追加の欠陥にしません。R0396の支払元は閉域のローカル処理で、正常な残高引落しと署名済みreceiptを生成します。実在の決済会社やネットワークへの接続、特定の外部決済protocolの再現は対象にしていません。

R0306の本人承認、R0307の排他的role、R0404の承認内容結合は別の制御です。承認状態を飛ばす既存R0395を重複計上せず、各ケースで他の必要な承認・role・残高・単回性を保持します。

## SQL・ファイル・JWT・数値などの境界16件

| root／代表変種 | 実処理とVの禁止結果 | F/Nの修正境界・正常対照 |
|---|---|---|
| R0003／B0003 | 利用者の列指定を実PostgreSQL SELECT listへ採用し、非公開値を返す。 | 表示列の固定対応表を使う。検索値は全条件でbindし、合法な列の組合せは維持。 |
| R0006／B0006 | 利用者の比較演算子を実WHEREへ連結し、保護行の条件を変更する。 | 演算子の固定対応表を使う。比較値は全条件でbindし、許可された大小比較は維持。 |
| R0121／B0121 | 実相対pathから公開rootの親へ進み、非公開fixtureファイルを読む。 | 利用先を公開root内へ制限。root内へ戻る合法な相対pathと実ファイルは維持。 |
| R0123／B0123 | query decode後のpath検査を、アプリの二段目decodeで越えて実ファイルを読む。 | 利用するdecode済みpathを検査。直接traversalは全条件で拒否し、合法な空白・percentファイル名は維持。 |
| R0126／B0126 | 公開root内の実Linux symlinkから、非公開の解決先を読む。 | realpath後の公開rootを検査。公開root内へ向く正規symlinkは維持。 |
| R0135／B0135 | 固定contextのcwdで再構築した実express.staticが相対rootを使い、内部ファイルを配信する。 | 絶対public rootで構築。固定2contextの切替えと公開ガイドは維持。 |
| R0137／B0137 | HTTPから渡したfile URIを実URL/fileURLToPath/fs.readFileで非公開fixtureへ解決する。 | guide schemeの固定resourceへ限定。全条件でネットワークschemeへ接続しない。 |
| R0138／B0138 | 主体別の実directory表で別主体のmount指定を採用し、非公開ファイルを読む。 | 認証主体のdirectoryへ固定。本人のファイル領域は維持。 |
| R0247／B0247 | 同じ強い鍵で正規署名された別サービスのJWTを、会員APIへ転用する。 | 期待audを検証。正規署名、期限、issuer、用途、存在する主体は全条件で保持。 |
| R0248／B0248 | 共用の強い鍵を使う別issuerの正規JWTを、信頼issuer用APIへ転用する。 | 期待issuerを検証。aud、用途、期限、実署名の検証は全条件で保持。 |
| R0249／B0249 | 正規のid+jwt/identity tokenを、at+jwt/api access tokenとして使う。 | typとpurposeの組を検証。署名、aud、issuer、期限と正常なID確認機能は維持。 |
| R0368／B0368 | 実LocationとChromiumで、戻り先を別ローカルHTTPS originへ変える。 | WHATWG URLで同originかつ固定workspace pathを要求。合法な相対path・URL風queryは維持。 |
| R0497／B0497 | 実Number/NaNの範囲・停止比較が成立せず、PostgreSQLの保護末尾行まで返す。 | 0～5の有限整数を検証。全条件の実験guardは12行。 |
| R0498／B0498 | 正確なPostgreSQL bigint IDをNumberのMap keyへ変換し、別の保護IDと衝突する。 | 文字列keyで区別。秘密IDの直接指定は全条件で拒否し、正しい大番号の正常アクセスは維持。 |
| R0499／B0499 | 実浮動小数の明細丸めと合計丸めが異なり、PostgreSQLへ不一致のminor金額を保存する。 | decimal文字列を整数minor単位へ一度変換して合算。正規の小数価格と上限金額は維持。 |
| R0500／B0500 | 実Array.atの負indexが、公開上限検査だけを越えて保護末尾要素を返す。 | 非負整数の公開indexだけ許可。正規0・1の参照と直接の秘密index拒否は維持。 |

R0003の識別子、R0006の演算子、既存R0001の検索値、R0005のORDER BY式は、採用するSQL構文と修正境界が異なります。ファイル群も相対root、decode順序、symlink解決先、static factoryの構築root、URI scheme、主体別directory表を分けています。共通のfixture外を読む機能、任意host mount、外部schemeへの通信を追加していません。R0138は実directoryによる名前空間表で、OS mount自体を操作する実装ではありません。

R0135で比較するのはcwd選択下でのmiddleware再構築です。既に構築したexpress.staticが後のcwd変更へ追随するという挙動は主張しません。公開の`GET /static-context`には、正規のsite/preview設定を選ぶ通常フォームを置き、前処理への経路を発見できるようにしています。フォームはV/F/Nで共通で、秘密ファイル名や正解を示しません。経路を発見できることだけで、ZAPが正常POSTを実行して必要なcontextを準備したとは扱いません。R0247～R0249は実HMAC署名を全条件で検証し、aud、issuer、token目的の独立した検査だけを比較します。

R0497～R0500はJavaScriptの数値・配列境界の代表実装です。nativeの整数overflow、境界外メモリアクセス、N-APIのメモリ破壊、ASan検知は実装・検証していません。元設計の`core_dast`を保持してこの実装範囲だけを採点します。R0368は元の`protocol_concurrency`系列を保持しますが、request smugglingやHTTP parserの不一致を再現するケースではありません。外部originの遷移先は応答解析に留め、実ブラウザーの遷移は別のローカルHTTPS listenerへ限定します。

## 同根重複と測定範囲

50件は既存の設計root／variantへ一代表ずつ対応させています。R0185の別ID表記B0186、R0198のreset・backup・認可code変種、R0210のMFA解除B0217などを新しいrootとして増やしません。代表一件の成立・検出だけで、同rootの未実装兄弟変種を検出済みにしません。既存のR0094/B0451統合も保持します。

当時の[panel-catalog-110.json](artifacts/panel-catalog-110.json)は110 root・330セルの未実行計画です。過去版の[60 root・180セル計画](artifacts/panel-catalog-60.json)、[60版の成立確認](artifacts/acceptance-60.json)、[60版の集計](artifacts/implementation-status-60.json)を履歴として保持します。検証済み210版の当時の計画は[panel-catalog-current.json](artifacts/panel-catalog-210-release.json)です。42件から60件へ追加した描画・資源・情報処理18件は[README-implementation.md](README-implementation.md)を参照してください。

60版・110版の集計にあるソースhashと参照名は当時の記録です。現行の同名ファイルとの一致や、当時のソース一式を復元したことを表しません。[当時の50件の検証索引](artifacts/implementation-batch-01-index.json)は110版ZIPの記録で、更新後の現行ファイルとのhash結合が有効であることを示しません。現行210版のソースと結果の結合には[implementation-status.json](implementation-status.json)と[バッチ2の検証索引](artifacts/implementation-batch-02-index.json)を使います。

過去60版の[51セルのZAP実行索引](artifacts/zap-batch-smoke-index.json)と[9条件の設定比較索引](artifacts/zap-tuning-smoke-index.json)は、当時の計画・入力・設定・ledger・生データに対する動作確認です。新50件のZAP検出実績やBurp比較は未測定です。アラート候補は実要求・結果・該当rootをレビューしてから採点し、共通の環境警告を検出数へ自動加算しません。

新50件の多くは正常POST、応答値の引継ぎ、OTP確認、別主体の承認、状態更新後の操作を必要とします。現行runnerのsession username確認、正常保護GETの200、HTTP探索・scan engineの完了だけでは、これらの手順へ到達した証拠になりません。成立確認の専用コードを実行できることと、ZAPが汎用にその正常経路を探索・準備できることを区別します。未到達・未対応はFNへ自動変換せず、同じ正常条件を再現するprotocolを整えてから評価します。

Burp Suite Professionalの実測とZAPとの比較は、ライセンス調達後に行います。オフラインXML取込みの合成データ検証は製品実行ではありません。診断方法と採点は[README-zap.md](README-zap.md)、[README-panel.md](README-panel.md)、[README-evaluation.md](README-evaluation.md)を参照してください。

現行開発版は243 rootで追加33件の最終回帰は保留しています。[バッチ03](README-batch-03.md)を参照してください。

現行開発版は243 rootで追加33件の最終回帰は保留しています。[バッチ03](README-batch-03.md)を参照してください。

現行開発版は243 rootで追加33件の最終回帰は保留しています。[バッチ03](README-batch-03.md)を参照してください。
