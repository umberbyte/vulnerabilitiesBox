# Web脆弱性診断ベンチマーク 初版

ZAPとBurp Suite Professionalの比較に用いるローカル環境です。設計337根本原因／500変種のうち、現在のソースcatalogは312根本原因・444変種です。[今回の進捗と未実装56変種](README-batch-05-progress.md)を参照してください。今回の追加10変種はDocker上でV/F計20条件を局所確認しました。現行全体のDocker成立確認・最終回帰は保留しており、全体受入済みの最新リリースは210件版（V/F/Nの630条件）です。未実装は25根本原因／56変種です。Burp実測はライセンス調達後に行います。

## 起動

Burpの実機診断はライセンス調達後に行います。当面はZAP側の設定・診断範囲とケースの拡充を進めます。保存済みのBurp XML取込み機能は、将来の比較に備えて保持しています。

Docker DesktopのLinux containersを起動し、このREADMEのあるフォルダーで実行します。初回はイメージを取得します。

```powershell
docker compose up --build -d --wait
docker compose exec -T app node src/control.mjs manifest
```

通常の入口は http://localhost:8080/ です。認証とブラウザー成立確認には https://localhost:8443/ を使います。`src/tls/local.crt` はこの実験専用の証明書です。ZAP／Burpの対象接続に対してだけ、この証明書を許可する設定を使ってください。8444は攻撃元または実験用の収集サービスを再現する別オリジンです。収集サービスへのPOSTとCORSのOPTIONSも公開通信の計測に含めます。

既存環境と同時に起動する場合は、別のComposeプロジェクト名とホスト側ポートを指定できます。コンテナー内部の8080/8443/8444は変わりません。

```powershell
$env:BENCHMARK_HTTP_PORT = '18080'
$env:BENCHMARK_HTTPS_PORT = '18443'
$env:BENCHMARK_ATTACKER_PORT = '18444'
docker compose -p web-benchmark-validation up --build -d --wait db redis executor app
```

Docker CLIがPATHから解決されない場合でも、Windows版Docker Desktopのインストール先にある`docker.exe`をフルパスで指定できます。例えばユーザーごとのインストールなら`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe`を確認してください。

ローカルにNode.jsやPostgreSQLをインストールする必要はありません。公開ポートは127.0.0.1に限定し、DB・Redis・実行ワーカー・制御APIはホストに公開していません。診断用アプリにはホストのディレクトリーやDockerソケットをマウントしません。

## ケースの切替と状態初期化

```powershell
docker compose exec -T app node src/control.mjs catalog
docker compose exec -T app node src/control.mjs reset R0271 V experiment-01
docker compose exec -T app node src/control.mjs variant-catalog
docker compose exec -T app node src/control.mjs reset R0001 V experiment-01 B0002
docker compose exec -T app node src/control.mjs manifest
```

`V`は脆弱な処理、`F`は修正版、`N`は安全な類似例の評価条件です。NはFと安全な処理を共有し、合法な操作や攻撃に似た入力に対する誤検出を確認します。三つの独立した脆弱性として数えません。同じ根本原因とseedには同じURLと通常データを与えます。切替はPostgreSQL・Redis・受信箱・アップロード実行領域を初期化し、セッションも無効化します。切替中は診断を停止してください。

一度に有効なのは一つのケースです。同じComposeプロジェクトに複数の診断を同時実行しないでください。[README-panel.md](README-panel.md)の管理者用計画と順次実行を使うと、ケース・V/F/N・seed・反復・認証条件を固定し、初期化を挟んでZAPを実行できます。総合シナリオ・並行実行は後続の実装範囲です。

`manifest`にはURL、正常入力、実験用の役割別資格情報、CSRF/JWT/OAuth値の取り出し方を出力します。対象側にもOpenAPIがあります。ケースID・V/F/N・正解・非公開canaryは公開HTTP入口に含めません。資格情報はすべてこの実験だけに使用する架空データです。匿名、Aliceだけ、複数役割の三条件を混ぜず、両製品に同じプロファイルを渡してください。

canaryはアプリ起動時に生成した非公開鍵で導出します。同じアプリの稼働中は同じ根本原因・seedで安定し、再起動すると変わります。公開seedとソースだけから正解確認用の値を算出することはできません。公開ケースの入口・機能から脆弱性の種類を推測できるため、これ自体は非公開評価セットではありません。

## 先行60件の代表変種

| 根本原因 | 代表変種 | 実際に使用する処理 |
|---|---|---|
| R0001 | B0001 | PostgreSQL文字列連結と保護行の読出し |
| R0021 | B0021 | HTML応答の反射XSSとブラウザー実行 |
| R0041 | B0041 | location.hashからinnerHTMLへのDOM XSS |
| R0124 | B0124 | 前段と後段で異なる区切り解釈による実ファイル読出し |
| R0141 | B0141 | 登録したNodeモジュールの別コンテナー内実行 |
| R0182 | B0182 | 認証結果オブジェクトの真偽判定と実セッション発行 |
| R0201 | B0201 | 連番の再設定トークンと実パスワード変更 |
| R0221 | B0221 | Redisセッションのログイン前後のID固定 |
| R0241 | B0241 | JWT alg:none受入れと保護データ読出し |
| R0251 | B0251 | ローカル認可コードログインのstate検証漏れ |
| R0271 | B0271 | 別所有者／別テナント文書の読出し |
| R0291 | B0291 | 一般会員による管理操作の実行履歴 |
| R0311 | B0311 | 別オリジンのブラウザーformによる連絡先変更 |
| R0332 | B0332 | sandbox iframeのOrigin:nullからの認証付きAPI読出し |
| R0380 | B0380 | Redis共有キャッシュへのエラー応答混入 |
| R0391 | B0391 | クライアント価格の採用と実残高・注文変更 |
| R0005 | B0005 | PostgreSQL ORDER BY式による非公開値依存の順序変化 |
| R0184 | B0184 | パスワード前方一致と実セッション発行 |
| R0189 | B0189 | 重複メール登録による既存認証情報の上書き |
| R0224 | B0224 | ログアウト後のRedisセッション再利用 |
| R0238 | B0238 | 非署名role Cookieによる権限昇格 |
| R0243 | B0243 | 辞書鍵で署名可能なJWT HMAC検証 |
| R0244 | B0244 | JWT自己申告JWKによるRSA署名検証 |
| R0246 | B0246 | 正規署名済み・期限なしJWTの受入れ |
| R0392 | B0392 | 負数数量による実残高の増加 |
| R0402 | B0402 | 自己紹介による実報酬付与 |
| R0202 | B0202 | 実期限を過ぎた回復トークンによるパスワード変更 |
| R0203 | B0203 | メール確認トークンの回復用途への流用 |
| R0204 | B0204 | 検証済みトークンと変更対象主体の不一致 |
| R0273 | B0273 | 一括対象の先頭だけの認可と他者文書の変更 |
| R0275 | B0275 | ページcursorによる所属tenant条件の上書き |
| R0281 | B0281 | 共有解除後も使用できる旧リンク |
| R0284 | B0284 | HTTPヘッダのtenant申告による他tenant読出し |
| R0395 | B0395 | 承認段階を経ない実決済・注文作成 |
| R0397 | B0397 | 部分返金の累計が実支払額を超過 |
| R0484 | B0484 | 実DB制約による後半障害と片側だけの残高更新 |
| R0461 | B0461 | HTTPフォームによる実資格情報の送信とHTTPSへの事前移動 |
| R0464 | B0464 | 実ディレクトリ一覧と内部バックアップファイルの取得 |
| R0465 | B0465 | 公開debug経路による使用中の内部DB設定の露出 |
| R0477 | B0477 | ログアウト後の実ブラウザーcacheからの機密レポート取得 |
| R0478 | B0478 | 公開JSのDB資格情報で実PostgreSQLへ認証・保護行読出し |
| R0481 | B0481 | 実DB型変換エラーの詳細応答への秘密context混入 |
| R0022 | B0022 | 二重引用符付きHTML属性の境界脱出と実ブラウザー実行 |
| R0025 | B0025 | 属性名の許可範囲不足によるevent handlerの設定 |
| R0026 | B0026 | リンクの実行可能なURL schemeと実クリック |
| R0027 | B0027 | inline JavaScript文字列の境界脱出と実実行 |
| R0029 | B0029 | script要素内JSONのHTML終端と実実行 |
| R0031 | B0031 | style要素内CSS値のHTML終端と実実行 |
| R0034 | B0034 | inline SVGのevent handlerと固定許可範囲への再構築 |
| R0428 | B0428 | PostgreSQL検索のページ件数上限と実返却行数 |
| R0437 | B0437 | Redis受信箱への通知登録回数の上限 |
| R0438 | B0438 | Redisの同時pending job上限と本人による取消 |
| R0439 | B0439 | 実験用依存処理の呼出し回数とretry上限 |
| R0440 | B0440 | 実ファイルへのUTF-8ログ追記量上限 |
| R0094 | B0451 | PostgreSQLモデルの内部属性返却と公開DTO |
| R0452 | B0452 | 実Bearer値のlocalStorage永続化とページ内保持 |
| R0453 | B0453 | Service Workerの機密応答cacheとログアウト後の再利用 |
| R0455 | B0455 | 機密帳票の公開static領域への保存と私有領域への保存 |
| R0457 | B0457 | ログインpasswordの実ブラウザーによる収集サービス送信 |
| R0458 | B0458 | 実ブラウザー例外のAuthorization context送信 |

上表は先行60件です。60件から110件へ追加した50件は[README-batch-01.md](README-batch-01.md)、今回の100件は[README-batch-02.md](README-batch-02.md)、42件から60件へ増やした18件の履歴は[README-implementation.md](README-implementation.md)を参照してください。R0094/B0451は元設計の属性単位返却の根本原因へ統合した組み合わせで、IDを揃えるための別ケースは増やしていません。今回のR0150/B0155も元設計のZIP重複entryの代表対応を保持します。

R0124は後段がバックスラッシュを区切りに変換する実装上の不一致を意図的に再現しています。LinuxやNodeの標準ファイルシステムがバックスラッシュを区切りとして扱う、という意味ではありません。R0141の正常機能はアップロードと利用・ダウンロードで、修正版はアップロードを実行領域から外してattachmentとして返します。実行ワーカーはDB接続情報を持たず、データネットワークに参加しません。Nodeのpermissionだけを隔離境界とはしていません。

R0251はstate検証を比較する簡略化したローカルIdPのfixtureです。一般的なOAuth/OIDC実装への完全な適合を評価するものではありません。R0311の攻撃元は同じホストの別ポートで、**同一site・別origin**です。別siteへの一般化はしていません。

R0005は非公開値に依存する公開商品の並び順を検査し、非公開行そのものの読出しはR0001で検査します。R0246は認証済み本人が取得できる旧発行系の正規署名済みJWTを使い、`exp`がないアクセス券を検証器が受理する欠陥を検査します。署名を変更せずに期限の必須確認を比較し、期限切れJWTはすべての条件で拒否します。

R0332も同一site・別originの前提です。今回のChromiumでは、通常のsandboxからのfetchはCookieが送られず、Vでも認証付き情報漏えいは成立しませんでした。成立fixtureは`SameSite=None; Secure`とsandboxの`allow-same-site-none-cookies`を使い、Originは引き続き`null`になります。ブラウザー全体のCookie保護は無効化していません。通常sandboxとこの明示条件の両方を検査し、結果に条件を記録します。この条件は[Chromiumの公開仕様説明](https://groups.google.com/a/chromium.org/g/blink-dev/c/TO4in4jqGdI)に基づきます。別ブラウザー／Cookie方針では成立条件を再確認してください。

R0461はDockerの診断ネットワーク内にある`http://benchmark.test:8080`を正常な開始点とします。F/Nはフォームへの資格情報入力前にHTTPSへ移動し、HTTP POSTの処理も拒否します。公開案内はHTTPでも利用できます。公開入力契約にHTTPとHTTPSの必要なoriginを同じ値で記録します。現行ZAP runnerはHTTPSのみを対象とするため、このケースは測定開始前に`unsupported_target_surface`として終了し、TP/FNの採点対象にはしません。ホストのhostsファイルを変更する必要はありません。

R0477は実ブラウザーのHTTP cacheを検査します。Vではprivate応答がfreshな期間にログアウトして再取得し、F/Nでは`no-store`で新しい要求が401になることを確認します。公開レポートには応答ごとの世代番号を付け、公開cacheが実際に再利用されることも確認します。この検証だけは証明書エラーを無視せず、実験用CAを**検証コンテナー内だけ**のNSS trust storeへ登録します。ホストの証明書ストアは変更しません。[ChromiumのHTTP cache実装](https://chromium.googlesource.com/chromium/src/%2B/d8cef607861/net/http/http_cache_transaction.cc)では証明書エラーのある応答を保存しないため、単にTLSエラーを無視した検証ではcacheの成立を示せません。

R0465・R0478・R0481は、debug経路の公開、公開assetの設定生成、例外処理の返却範囲という別の欠陥境界を比較します。同じ情報が漏れるという理由だけで統合しません。専用の読取用DB roleと架空の資格情報を使用し、アプリがその資格情報で実際に接続することを確認します。R0478では公開JSから観察したURLを管理者専用probeへ渡し、実DB認証と保護行の取得まで確認します。DBは診断ネットワークへ公開していないため、DASTによる検出対象は公開assetへの露出です。DB利用可能性の証明をscannerへ提供して採点する方式ではありません。

同じ稼働中のroot・seedでは専用DB資格情報もV/F/N間で同じです。F/Nは現在の公開面からの再露出を防ぐ条件であり、Vで既知になった資格情報の失効を評価する条件ではありません。別rootへの切替時にはこのroleの資格情報を置き換えます。

## 成立確認

Windows（PowerShellの実行ポリシーを変更する必要はありません）:

```powershell
.\verify.cmd
```

macOS／Linux:

```sh
sh verify.sh
```

実DB・Redis・Chromiumを使い、210×V/F/Nの630条件について正常操作、脆弱性の結果、修正版の防止、安全な類似例、初期化、正解APIの分離を確認します。結果は`artifacts/acceptance.json`に保存します。HTTP cacheとService Workerの信頼済みTLS検証以外での自己署名証明書エラーの許可は、この実験用ブラウザーコンテキストだけに適用します。

成立確認と回帰テストの最新件数・実測版は[implementation-status.json](implementation-status.json)に記録します。今回のソース・成立確認・回帰テスト・計画の対応は[バッチ2の検証索引](artifacts/implementation-batch-02-index.json)を参照してください。回帰テストは`artifacts/unit-tests.tap`に保存します。

`verify.cmd`はPowerShellからもコマンドプロンプトからも実行できます。`.\verify.ps1`が「このシステムではスクリプトの実行が無効」で止まった場合も、同じフォルダーで`.\verify.cmd`を実行してください。既存の`verify.ps1`も保持しています。

`V`の成立確認が通ったことは、ZAPまたはBurpが検出したことを意味しません。ZAP／Burpによる製品測定は別工程です。

## ZAP／Burpへ渡す条件

1. 同じ根本原因・seed・armに初期化し、通常入口またはOpenAPIを取り込みます。認証ケースではmanifestの正常ログインと必要なセッション／トークン更新を設定します。
2. 通常の診断対象を8443のワークスペース配下に限定します。R0461には明示されたHTTP開始点も必要です。R0457/R0458には8443と8444の収集経路が必要です。各ケースの`requiredTargetOrigins`に従い、対応しない経路は未測定として記録します。CSRF/CORSの攻撃元fixtureを通常の探索対象に含める必要はありません。制御キー・oracle・正解データを診断エージェントに渡さないでください。
3. 製品、バージョン、add-on、プロファイル、設定ファイルのhash、認証／探索の到達確認、制限時間、送信数、並行数を記録します。ケース切替直後のセッションを使い直します。
4. 同条件でF・Nも実行し、未到達・認証失敗を脆弱性の不検出と混同しないよう記録します。初期化を挟み、原則3反復します。提案予算120秒／300リクエスト／並行2は、先行実験で校正してから固定します。
5. 通知・アラートの件数を検出数にせず、該当する根本原因と証拠をレビューします。既存add-on、独自add-on、Codex実行時補助は別プロファイルとして測定します。

F/Nの誤検出は、当該ケースが比較する根本原因のアラートについて判定します。証明書・Cookie方針など実験環境に由来する通知や他の根本原因の指摘は、別に記録・調査してください。F/Nを「全種類の診断で警告ゼロのサイト」とは扱いません。

成立確認テスト内の自動ログイン、API入力一覧、ZAPの匿名・session・bearerプロファイル、証拠レビュー後のケース単位集計、Burp XMLのオフライン取込みを含みます。Burp取込みはHTTP証拠と別途保存した実行条件を結び付ける工程で、製品実行は行いません。ZAPのOAuth・トークン更新・多段業務フロー、Burpの実行アダプター、MCP駆動、アラートと実影響証拠の自動対応はまだ含みません。購入やキャッシュは状態を変えるため、同じ診断で繰り返す前に初期化してください。

R0428/R0437/R0438/R0439/R0440は元設計の`bounded_stress`系列です。小さな有限データで、業務上の量・回数上限と実際の結果を比較します。物理的なサービス停止、CPU飽和、外部メール送信、ディスク枯渇の再現は行いません。通常DAST、ブラウザー診断、状態を持つ業務フロー、有限の資源制限は、それぞれの到達条件と予算を固定して評価してください。現在のHTTP runnerが終了しただけで、ブラウザー内の実行やcacheの漏えいが診断されたとは扱いません。

ZAP実行の入口と認証・ヘッダー補助の制限は[README-zap.md](README-zap.md)に分離しています。これは生アラートと通信条件を保存する段階です。人が証拠を確認した後に集計する手順は[README-evaluation.md](README-evaluation.md)を参照してください。ZAP／Burpの実製品比較や実務投入判定は未実施です。

同じ根本原因・seedで実行した匿名baseline/activeの動作確認記録を、[zap-smoke-index.json](artifacts/zap-smoke-index.json)から参照できます。過去の試行を除外した理由も記録しています。

認証済みプロファイルの本人・保護操作への到達と、診断時に変更したCookie/JWTの保持を確認した先行60版の履歴は[認証スモーク索引](artifacts/zap-auth-smoke-index.json)に保存しています。全210ケースのZAP検出率を評価した結果ではありません。

同じ認証設定を異なるworkspaceに適用した比較用hashの確認は[設定hashの検証索引](artifacts/zap-configuration-smoke-index.json)を参照してください。ケースごとのURLを含む監査用hashと、設定を系列として集計するための比較用hashを分けています。

[順次実行の検証索引](artifacts/panel-smoke-index.json)には、R0461のV/F/Nを未測定の`unsupported_target_surface`として記録した後、R0464のV/F/Nを順に完了した6セルの履歴があります。計画の内容、各セルの正常入力、run・設定hash、通信の終了待ち、既存ledgerの上書き拒否を確認しました。[当時の42ケース・126セル計画](artifacts/panel-catalog-42.json)も履歴として保存します。全ケースのZAP測定や検出率の評価を実施した記録ではありません。

現行catalogの計画は[panel-catalog-current.json](artifacts/panel-catalog-current.json)です。210ケース×V/F/Nの630セルの管理者用計画です。[110ケース・330セルの計画](artifacts/panel-catalog-110.json)と[60ケース・180セルの計画](artifacts/panel-catalog-60.json)は当時の履歴として保持します。過去60版の[51セルのZAP実行記録](artifacts/zap-batch-smoke-index.json)と[9条件の設定比較](artifacts/zap-tuning-smoke-index.json)は、その計画・ledger・生データに対応する記録です。先行50件や今回100件のZAP検出実績へ引き継ぎません。Burp取込みの合成データ検証は[専用索引](artifacts/burp-import-smoke-index.json)へ保存しており、Burpの実機診断はライセンス調達後に行います。

追加分のMFA、招待、委任、承認、支払、OAuth/OIDCは、正常POSTと応答値の引継ぎや複数主体を必要とします。今回のブラウザー処理はクリック、navigation、window移動、Cookie送信、CSP/SRIなどの実結果、暗号・log・監査処理の一部は管理者専用snapshotを必要とします。sessionのusername確認や通常GETの200だけでは、これらの操作へ到達したとは扱いません。HTTPのDASTと私的監査の採点範囲を区別します。R0497～R0500は実JavaScript数値・配列境界を使い、nativeメモリ破壊やASanの評価は対象にしていません。各修正境界を一つのrootにまとめ、同rootの未実装兄弟変種を検出済みへ繰り上げません。

## 管理者だけが使う正解確認

```powershell
docker compose exec -T app node src/control.mjs oracle
docker compose exec -T app node src/control.mjs mail-alice
```

oracleには実際の連絡先・残高・注文・操作履歴があります。ブラウザー実行はacceptanceのDOM検査、データ漏えいは私有canaryとの照合で確認します。Aliceの受信箱だけを、正常な回復操作の補助情報として対象ツールに提供できます。Bobの受信箱やoracleを提供すると、トークン予測の評価条件が変わります。

## 終了

```powershell
docker compose down
```

永続ボリュームを使用していないため、終了後の再起動でDB状態は初期化されます。結果JSONはホストのartifactsに残ります。イメージdigestとnpm lockを固定しています。ブラウザーはDebianパッケージのビルド時点の版なので、実測版をacceptance.jsonに記録します。最初の実行確認環境はWindowsのDocker Desktop／Linux ARM64です。他のCPU・OSの実行確認は別途必要です。

実装範囲・成立確認結果は`implementation-status.json`を参照してください。元の337／500件の資料は設計資料として保持します。この初版だけから本番運用でのBurp同等性を判断することはできません。
