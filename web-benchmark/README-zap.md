# ZAP実行経路の初版

現在選択中のケースに対して、ZAPのパッシブ診断またはアクティブ診断を実行し、生のアラートと実行条件を保存します。匿名・セッション認証・Bearer認証のプロファイルを選べます。Docker Desktop / Docker Composeのみで動きます。PowerShellの実行ポリシー変更や、ホストへのJava / Node.js導入は必要ありません。

Windowsでは、このフォルダーで次を実行します。

```powershell
.\scan-zap.cmd
.\scan-zap.cmd active 120 300
.\scan-zap.cmd active-low 120 300
.\scan-zap.cmd baseline 120 300 session alice
.\scan-zap.cmd active 120 300 bearer admin
```

macOS / Linuxでは次を実行します。

```sh
sh ./scan-zap.sh
sh ./scan-zap.sh active 120 300
sh ./scan-zap.sh active-low 120 300
sh ./scan-zap.sh baseline 120 300 session alice
sh ./scan-zap.sh active 120 300 bearer admin
```

引数は順に `baseline|active|active-low`、診断時間（秒）、リクエスト停止目安、`anonymous|session|bearer`、fixtureユーザーです。省略時は `baseline 120 300 anonymous alice`。従来の3引数でも匿名プロファイルとして動きます。ユーザーは `alice`・`bob`・`carol`・`approver`・`admin` から選びます。時間は10〜1200秒、リクエストは10〜3000件です。`baseline` は公開入口・正常なGET例・通常Spiderの通信をパッシブ診断します。`active` はさらにOpenAPIを取り込み、既定のscan policyでアクティブ診断します。`active-low` は同じ正常入力・探索・認証・時間／件数条件を使い、専用policyで全インストール済みアクティブルールを有効化して、各ルールのAttackStrengthをLOW、AlertThresholdをMEDIUMへ明示します。ブラウザーを使うDOM XSS診断、複数ロールをまたぐ操作、CSRF値の更新を含む業務フローはこの初版の対象に含みません。

`active-low` の設定は全root・V/F/Nに共通で、case IDや正解、過去の検出結果をルール選択へ使いません。既定policyの無効ルールも専用policyでは有効になるため、一般には強度以外に有効ルール集合も異なり得ます。`active`との比較では保存したルール集合と閾値を照合し、強度だけの差とみなせる条件か確認してください。MEDIUM閾値をLOWへ緩める処理はありません。LOWは攻撃数を減らす設定で、見逃しが増える可能性があり、軽負荷・完走・検出を保証する値ではありません。[ZAP公式scan policy説明](https://www.zaproxy.org/docs/desktop/ui/dialogs/scanpolicy/)

専用policy名は全runで `benchmark-active-low-v1`、設定方式は `benchmark-active-low-0.1` です。`addScanPolicy`で新規作成し、全rule IDへLOW/MEDIUMを指定した後、名前付き`scanners` viewを再取得して、ID集合・有効状態・明示値が一致することを確認します。APIの`DEFAULT`は継承を示すので、LOWへ設定済みとは扱いません。同名policyが既に存在する場合は再利用・上書きせず失敗します。既定policyと既存policyの設定は変更しません。

認証プロファイルは、公開manifestの正常なログイン契約と選択ユーザーのfixture認証情報を使います。ログイン・セッション確認・トークン発行・正常な保護操作の到達確認はすべてZAPが送る実HTTPで行い、計測窓と通信予算に含めます。正解確認APIから認証情報やトークンを取得しません。`session` は `/session` の本人を検証します。`bearer` はさらにmanifestの `extractions.bearer` で宣言されたトークン発行GETを使い、宣言済みの `/member-api` または `/account-report` の正常GETが200になることを確認します。これらの操作がないケースは `unsupported` になります。たとえば管理者限定APIに正常なAliceトークンでアクセスしたときの403は、選択ロールが未対応の組み合わせとして扱います。自動的に管理者へ切り替えません。

追加した資源制限5件と、R0457を除く情報処理5件は、公開manifestの`authentication.sessionProtectedOperation`に通常の保護GETを宣言します。runnerは操作が公開`requests`と一致し、同じworkspaceに属することを確認してから、認証header付き実HTTPの200応答で到達を検査します。ここへrootやV/F/N、正解値は渡しません。この確認は正常GETへの到達であり、状態を変える後続操作やブラウザー機能の成立までは意味しません。

ログイン失敗、本人の相違、保護操作への未到達では診断を続けません。認証状態を保つため、認証付きプロファイルはログイン・ログアウト・OAuth接続／callbackのURLを探索・OpenAPI再生・アクティブ診断から除外します。診断入口そのものがこれらの認証操作になっているケースは、認証付きプロファイルでは `unsupported` です。

公開manifestの `requiredTargetOrigins` がHTTPS入口以外のoriginを要求すると、このadapterは計測開始前に `unsupported_target_surface` で終了します。R0461はHTTP開始点、R0457/R0458はHTTPS 8443から別originのHTTPS 8444へ送る収集経路を要求するため、現行runnerでは未対応です。宣言がない従来契約は現在のHTTPS入口を必要originとします。公開入力・workspace・manifest hashを保存し、未到達の対象面を検出／見逃しとして採点しません。

ソースcatalogは243 rootの代表243変種、V/F/Nの計画は729条件です。追加33件と現行全体の最終成立確認は保留しており、検証済み630条件は210版の履歴です。このrunnerに243件すべての必要な操作があるという意味ではありません。今回の100件要求は33件だけ進み、残る67件はサービス側制限で停止しています。[今回の追加と制限](README-batch-03.md)を参照してください。描画境界7件は成立確認で実Chromiumを使いますが、現行runnerにはDOM診断や実クリックの自動化がありません。localStorageとService Workerの操作、認証をまたぐcache再利用、正常応答のIDを使うjob取消も、単なるHTTP探索の完了と区別してください。資源制限5件は元設計の`bounded_stress`系列で、有限の業務上限を検査し、物理的な負荷耐性を測定しません。[追加18件の履歴](README-implementation.md)と[追加50件](README-batch-01.md)にケースごとの操作・証拠・範囲を記載しています。

追加50件のMFAでは専用signinのpassword段階とOTP完了段階を区別し、通常loginのsessionだけで保護APIへ進めません。`/session`のusername確認はOTP完了の証拠になりません。招待token、委任対象、承認した内容、支払通知なども、通常POST・応答値の引継ぎ・必要な主体切替えを固定したprotocolが必要です。現行runnerの正常保護GET確認だけでは後続の操作へ到達したとは扱いません。R0497～R0500はJavaScriptの数値・配列境界の代表実装で、nativeメモリ破壊やASan検知は評価していません。

過去60版の[51セルの実行索引](artifacts/zap-batch-smoke-index.json)と以下の9条件の設定比較は、当時の入力と設定に対する動作確認です。新50件のZAP検出実績とBurpとの比較は未測定です。

ケースは既存の `src/control.mjs reset ROOT V|F|N [seed]` で選択します。実行スクリプトは起動済みアプリのイメージを再ビルドせず、選択を変更しません。ソース更新後は先に `docker compose up --build -d --wait` を実行してからケースを選択してください。アプリのコンテナーを再作成すると初期ケースに戻ります。

```powershell
docker compose up --build -d --wait
docker compose exec -T app node src/control.mjs reset R0001 V scan-example
.\scan-zap.cmd active 120 300
```

実行中は他の診断・受入検証・ケースの切替を行わず、ブラウザーを閉じてください。計測値はZAPの推定値ではなく、計測窓中にアプリの公開リスナーへ到達した通信の総数です。8444の収集経路も同じ計測器を使い、POSTとCORSのOPTIONSを含めます。他のクライアントが同時に使うと、その通信も含まれます。内部ヘルスチェックと非公開制御リスナーの通信は含まれません。

## 出力

`artifacts/zap-<日時>-<識別子>/` に次を保存します。入力契約やOpenAPIのファイルは、取得した段階まで生成します。manifest取得後に計測開始前の `unsupported` となる実行でも、`public-inputs.json` とそのhashは保存します。OpenAPIや実通信の入力は、取得前には生成しません。古い保存済みrunは当時取得した資料のまま保持します。

- `run.json`: ZAPバージョン、固定イメージ、設定、時間、状態、到達したリクエスト総数、最大同時処理数、予算超過、停止時の未完了通信・ハンドラー数、制限事項。
- `alerts.json`: ZAP APIのアラート一覧。陽性／誤検知の採点をしていない生データ。
- `messages-first-500.json`: 最大500件のHTTPメッセージ。診断証拠の確認用。
- `urls.json`: ZAPが認識したURL。
- `scanner-settings.json`: 導入済みadd-onとルールの版・設定。`active-low`は選択した名前付きpolicyの実`activeScanners`と`activeScanPolicy`設定を保存。
- `public-inputs.json`, `openapi-original.json`, `openapi-anonymous.json`: 正常な入力契約と、このプロファイルで実際に使った定義。
- 認証付き実行の `openapi-authenticated.json`: `openapi-anonymous.json` と同じ、実際に取り込んだ定義。互換用ファイル名と認証付き用ファイル名を併記しています。

`run.json` の `authReachability` は認証方式、公開fixtureのユーザー識別子、本人確認の成否、正常な保護操作の到達成否を記録します。sessionでは宣言済みの文書・プロフィールなど、対応済みの正常GETがある場合にその到達も確認します。対応する保護GETがない場合は、本人確認だけで保護操作の成功を主張しません。パスワード・セッションID・JWT・制御鍵は `run.json` と標準出力に記録しません。公開manifestを取得できた実行は、未測定の `unsupported` でも `workspace` を保存します。

設定には二つのSHA256を記録します。`scannerSettingsSha256` は、保存したsnapshotを `JSON.stringify` した全体の監査用hashです。`scannerConfigurationSha256` は、`authPolicy.excludedOperations` の先頭workspaceだけを固定placeholderへ置換し、その除外path配列をsortして、objectのkey順を揃えた比較用hashです。ルール・版・認証方式・ユーザー・その他の配列順や設定値は保持します。正規化方式は `normalizationVersion` の `workspace-paths-0.1` です。これにより同じ設定の別root／seedを一系列にまとめられます。除外pathが選択workspaceの外や部分一致の場合は比較hashを生成せず失敗します。既存の保存済みrunは変更せず、評価CLIが監査用hashを照合したsettingsファイルから同じ比較hashを計算します。

`active-low`の二つの設定hashにはpolicy名・設定方式・LOW/MEDIUM宣言・実ルール設定も含まれます。runの`activeScanPolicy.selectedSnapshotSha256`は実`activeScanners`単体の`JSON.stringify` SHA256です。`activeScanInvoked`は`ascan.scan`を名前付きpolicyで起動したかを記録します。予算が探索中に尽きた場合はfalseで、有効化・設定確認だけからアクティブ診断の実行を推定しません。`unavailableDependencyRuleIds`と各ルールのdependency情報も保存し、有効化が全ルールの実行や到達の証明になるとは扱いません。

**生のHTTP記録やアラートにはfixtureのログイン本文・セッションID・JWTが残り得ます。** `public-inputs.json` には共通契約のfixture認証情報も含まれます。これらの診断資料は、このローカルfixtureの検証資料として扱ってください。

ZAPのhistoryには送信していない合成レコードや一時レコードの複製が含まれ、欠けたレコードもあり得ます。保存した行数を実通信数として扱わず、件数はアプリの計測を使ってください。HTTP記録は完全なパケット記録ではないため、保存済みレコードの認証やURL範囲を確認できても、全計測通信の証明とは区別します。

`completed` は診断処理と通信・ハンドラーの収束確認の完了、`budget_stopped` は時間または通信数による停止と収束確認の完了、`incomplete_drain` は停止後の収束を確認できなかった状態、`unsupported` は対象origin・認証契約・選択ロールが未対応、`failed` は実行経路または認証確認の失敗です。認証失敗と未対応は非0の終了コードで止まります。アラートの有無によってスクリプトを失敗扱いにはしません。予算で止まった部分診断も完了診断と区別して保存します。

## 測定上の制限

通信数は500msごとの監視で停止要求を出す**目安**です。実行中の通信があるため、厳密な件数上限ではありません。Spiderとアクティブ診断は順番に実行し、それぞれワーカースレッド数を2に設定します。これもサーバー全体の同時処理を2に固定する仕組みではありません。超過の実測値を `run.json` に記録します。診断時間の後に、停止・通信の収束待ち・レポート取得が続きます。ZAP起動・イメージ取得・Dockerビルドの時間は診断時間に含みません。

停止後は通信数の増加が止まることに加え、`activeRequests`（計測対象で応答未完了の通信）、`openRequests`（計測外を含めた公開リスナーで応答未完了の通信）、`pendingHandlers`（接続が閉じても実行中の非同期処理）がすべて0になることを確認します。収束待ちは約10秒で打ち切り、その状態を `drainPendingState`、`pendingAtMeasurementStop`、`trafficSettled` に保存します。必要なカウンターがない旧版アプリでも収束済みとは判定しません。

業務ハンドラーの追跡は、返されたPromiseの完了を基準にしています。現行ケースの非同期業務処理はこの方式に対応しています。ケースを追加するときは非同期処理のPromiseを返す必要があり、切り離したcallbackやバックグラウンド処理の終了までを保証するものではありません。

`measurement/stop` は新しい通信の集計を止めますが、終了待ちのカウンターを消しません。未完了の公開通信や非同期処理が残っている間、アプリはケースの初期化と次の計測開始を拒否します。`incomplete_drain` の結果を完了診断として扱わず、処理が収束してから同じ初期状態で再実行してください。長時間の処理が解消しない場合はアプリを再作成して状態を初期化します。

正常なアカウントの認証情報は共通入力契約に含まれますが、この匿名プロファイルでは正常ログインPOST・ログアウトPOST・IdP認証POSTをOpenAPI取り込みから除外し、正常認証情報をZAPに再生しません。認証済み画面への到達率、ロール差、操作の順序は評価していません。ZAPが認証不備を診断中に突く可能性があるため、「すべての通信が匿名だった」という判定も行いません。

認証付きプロファイルは実験的な **欠落ヘッダー補完** を使います。ZAPの公式HttpSenderスクリプト機能で、対象workspace内の通信にCookie／Authorizationがない場合だけ正常値を加えます。すでに存在する値には触れないため、scannerが変更した不正なCookieやJWTを正常値に戻しません。認証を確立したsessionでは不正Cookie、bearerでは不正Cookieと不正Bearerを明示してZAPの実HTTPを送り、それが保存され、本人確認／保護操作で拒否されることを自己確認します。

ただし、診断ルールが認証ヘッダーを**完全に削除した場合**も再補完します。このプロファイルをヘッダー削除・認証ヘッダー欠落に関する性能採点に使わないでください。その試験には補完を無効にした別条件が必要です。自動の再ログイン・JWT更新には対応せず、段階間と長いスキャン中は本人を再確認します。停止後の最終本人確認も計測に含まれ、softな件数目安に1〜2件追加される場合があります。収束が未確認のまま最終本人確認を成功扱いにはしません。

この実行経路だけでZAPとBurp Suite Professionalの公平な比較や、実践投入可否を判断することはできません。陽性・修正版・安全な類似例の繰り返し、アラート証拠の対応付け、認証と探索の共通条件、Burp側の実行記録が必要です。匿名と認証付きは到達条件が異なるので、その結果を同一条件の性能比較として扱いません。共通入力契約から派生させた定義と実際の認証条件を保存して、後で比較条件を再現できるようにしています。

## 分離と固定条件

ZAPは `scan` ネットワークだけに参加し、DB・実行ワーカーのネットワークには入りません。ホストへのZAP API公開、Dockerソケットのマウント、ZAPコンテナーへのホストディレクトリーのマウントはありません。ZAPが読むDocker volumeには、このプロファイル用のOpenAPIと、認証付きの場合の一時的なHttpSenderスクリプトを置きます。スクリプト内の正常Cookie／Bearerはローカルfixtureの値で、終了時に削除します。

ZAP API鍵は実行ごとに生成し、アプリ起動時に生成される制御鍵とは別の値を使います。制御鍵を持つのは操作スクリプトと別のコントローラーだけです。ZAPへ制御鍵・ケースID・陽性／修正版のラベル・正解確認APIを渡しません。ターゲットは `https://app:8443/w/<公開の不透明パス>` に限定します。制御リスナー8099、別オリジン8444、HTTP8080は対象外です。

公式stableイメージを次のmulti-platform digestに固定しました。2026-10-02にAMD64 / ARM64のmanifestを確認し、ARM64環境で取得しました。診断ごとのadd-on更新は行いません。

```text
ghcr.io/zaproxy/zaproxy:stable@sha256:781a2bdaea47324e7bab583e2263f21d257b0aee61ed51521a5be45f5f5081ef
```

イメージを変更するときはComposeと記録を併せて変更し、過去の条件と混同しないでください。`stable` はコアのリリースだけでなく、ベースイメージやadd-onの更新でも変化します。[公式Dockerガイド](https://www.zaproxy.org/docs/docker/about/)

APIによる探索・停止・ルール・スレッド数の設定は[公式APIドキュメント](https://www.zaproxy.org/docs/api/)を基にしています。OpenAPIのターゲット上書きとContextでの除外は[OpenAPI Support](https://www.zaproxy.org/docs/desktop/addons/openapi-support/)に従っています。通信タイムアウトとHTTP状態の設定は[Network API](https://www.zaproxy.org/docs/desktop/addons/network/api/)を参照しています。

専用policyの作成、全ルール有効化、各ルールの強度・閾値、名前付き選択とsnapshotは、固定コア版の[ZAP 2.17.0 ActiveScanAPI](https://github.com/zaproxy/zaproxy/blob/v2.17.0/zap/src/main/java/org/zaproxy/zap/extension/ascan/ActiveScanAPI.java#L406)を確認しています。`addScanPolicy`は既定policyのcloneではなく新規templateを使います。LOW/MEDIUMのper-rule指定は同実装の`setScannerAttackStrength`/`setScannerAlertThreshold`、scanの`scanPolicyName`、viewの`scanners`に従います。継承値の意味は[AbstractPlugin](https://github.com/zaproxy/zaproxy/blob/v2.17.0/zap/src/main/java/org/parosproxy/paros/core/scanner/AbstractPlugin.java#L829)、dependency不足によるルール実行の制約は[PluginFactory](https://github.com/zaproxy/zaproxy/blob/v2.17.0/zap/src/main/java/org/parosproxy/paros/core/scanner/PluginFactory.java#L289)を参照しています。

認証補完に使う `script/load`・`enable`・`disable`・`remove` は[公式script APIクライアント](https://github.com/zaproxy/zap-api-python/blob/main/src/zapv2/script.py)、Graal.jsエンジンは[公式GraalVM JavaScript説明](https://www.zaproxy.org/docs/desktop/addons/graalvm-javascript/)を参照しています。HttpSenderの送信／受信callbackは[公式テンプレート](https://github.com/zaproxy/community-scripts/blob/main/httpsender/README.md)に沿っています。固定Replacerで既存の認証ヘッダーを上書きする方式は使用していません。

## 停止

`active-low`では設定snapshotを生レポートより先に保存し、`ascan.scans`がFINISHEDで、private計測がinactive・`activeRequests`/`openRequests`/`pendingHandlers`がすべて0と確認した後、このrunが作成した専用policyだけを削除します。`newSession`はglobal policyを消さないため、この削除を各セルで行います。削除後はpolicy一覧の復元、名前付き取得の`DOES_NOT_EXIST`、既定scanner snapshotの不変を確認します。削除APIの成功応答だけを証拠にはしません。[PolicyManagerの削除実装](https://github.com/zaproxy/zaproxy/blob/v2.17.0/zap/src/main/java/org/zaproxy/zap/extension/ascan/PolicyManager.java#L185)

証拠は`run.activeScanPolicy.cleanup`の`required`、`snapshotSaved`、`removed`、`absenceVerified`、`originalPolicyInventoryVerified`、`defaultScannersUnchanged`、`activeScansFinished`、`publicTrafficSettled`に保存します。保存失敗・未収束・削除／復元確認の失敗は`failed`にして逐次実行を止めます。snapshotが保存できない場合や未収束の場合はpolicyの削除を行わず、wrapperがZAP containerを終了・削除します。FINISHEDはAPIの状態を示すため、公開requestやhandlerの収束確認も必要です。旧baseline/activeの設定snapshotと既存planの意味は維持し、専用policyの作成／削除時刻を比較設定hashへ入れません。

正常終了時も実行失敗時も、実行スクリプトはこの実行で使ったZAPコンテナーを削除します。アプリと検証結果は残します。端末ごと強制終了してZAPが残った場合は、Docker DesktopのContainersから `web-benchmark-pilot` の `zap` を停止してください。診断の途中でケースを切り替えると結果が無効になるため、再度同じ初期状態から実行します。

<!-- tuning-runtime-observations -->

## 通常設定と低強度設定の実行確認

[過去60版の9条件の計画・ledger・生データ索引](artifacts/zap-tuning-smoke-index.json)と[観測・次の優先事項](artifacts/zap-tuning-observations.json)を保存しました。R0022のV/F/Nで、同じseed・正常入力・匿名認証・60秒・通信1,000件を停止目安とし、baseline/active/active-lowを各1回実行しました。全9条件が完了し、専用policy3回の削除と既定設定の復元も確認しています。

| 条件 | profile | 公開通信数 | 計測秒数 | 40012の未レビュー候補 |
|---|---|---:|---:|---:|
| V | baseline | 8 | 3.100 | 0 |
| V | active | 460 | 27.406 | 1 |
| V | active-low | 376 | 24.744 | 1 |
| F | baseline | 8 | 3.067 | 0 |
| F | active | 467 | 27.230 | 0 |
| F | active-low | 383 | 22.703 | 0 |
| N | baseline | 8 | 3.060 | 0 |
| N | active | 467 | 27.242 | 0 |
| N | active-low | 383 | 22.708 | 0 |

この環境ではactiveとactive-lowの有効ルールID集合が同じ52件でした。既定値はsnapshotでDEFAULTと記録され、低強度側はLOW/MEDIUMを明示しています。設定有効化・診断engineの完了は、全ルール・全入力の実行証明ではありません。1ケース・各1回の結果から、一般的な検出率や性能の同等性を判断しません。XSS候補はZAPの実payloadをブラウザーで確認するレビューが残っています。共通のHTTP設定警告も生データに保持し、代表根本原因の検出数へ自動加算していません。

以前の通信100件を目安としたactive3条件は途中停止の履歴です。今回の完了結果へ置き換えず、診断予算を校正する別記録として保持しています。

Burp実測はライセンス調達後へ延期しています。次は正常POSTと応答値の引継ぎ、導入済みadd-onを使った実ブラウザー操作、公開契約に従う複数originの到達支援を優先します。これらは未実装の改善候補です。具体的な対象・受入条件は観測ファイルへ記載しました。
