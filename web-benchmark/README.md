# Web脆弱性診断ベンチマーク

ZAPとBurp Suite Professionalを同じ条件で比較するためのローカルWebアプリです。アプリは意図的に脆弱です。現在選択できるソースは設計上の337根本原因・500変種すべてです。[実装範囲と検証状態](README-coverage.md)に、成立確認済みの範囲と未測定項目をまとめています。Burpの実測はライセンス調達後です。

## 起動

Docker DesktopのLinux containersを起動し、このREADMEがある`web-benchmark`ディレクトリで実行します。初回はPostgreSQL・Redis・MongoDB・OpenLDAPとアプリのイメージを取得します。

```powershell
docker compose up --build -d --wait
docker compose exec -T app node src/control.mjs manifest
```

通常の入口は http://localhost:8080/ 、認証とブラウザー確認用の入口は https://localhost:8443/ です。8444は攻撃元または実験用収集サービスの別originです。公開ポートは127.0.0.1に限定し、PostgreSQL・Redis・MongoDB・OpenLDAP・実行ワーカー・制御APIをホストに公開しません。`src/tls/local.crt`と`src/tls/local.key`は公開済みの実験専用fixtureです。実運用システムへ転用しないでください。

別のComposeプロジェクトを同時に起動する場合は、ホスト側のポートを変更できます。

```powershell
$env:BENCHMARK_HTTP_PORT = '18080'
$env:BENCHMARK_HTTPS_PORT = '18443'
$env:BENCHMARK_ATTACKER_PORT = '18444'
docker compose -p web-benchmark-validation up --build -d --wait db redis mongo ldap executor app
```

Docker CLIがPATHから見つからない場合は、Docker Desktopの`docker.exe`をフルパスで指定してください。ユーザーごとのWindowsインストールでは`%LOCALAPPDATA%\Programs\DockerDesktop\resources\bin\docker.exe`などを確認できます。ホストにNode.jsやPostgreSQLを入れる必要はありません。

## ケースを選ぶ

```powershell
docker compose exec -T app node src/control.mjs catalog
docker compose exec -T app node src/control.mjs variant-catalog
docker compose exec -T app node src/control.mjs reset R0271 V experiment-01
docker compose exec -T app node src/control.mjs reset R0001 V experiment-01 B0002
docker compose exec -T app node src/control.mjs manifest
```

`V`は脆弱な処理、`F`は修正版、`N`は安全な類似入力です。F/Nを別の脆弱性として数えません。同じ根本原因とseedではURLと通常データを揃えます。`reset`はPostgreSQL・Redis・受信箱・アップロード領域を初期化し、セッションも無効化します。切替中は診断を停止してください。一つのComposeプロジェクトで同時に有効なのは一ケースです。

`manifest`には通常入口、正常入力、実験用の認証情報、CSRF/JWT/OAuth値の取り出し方を記録します。公開アプリにもOpenAPIがあります。非公開canary、V/F/Nの正解、管理者用oracleは公開HTTP入口に含めません。公開ソースから欠陥の種類を推測できるため、このベンチマーク自体は非公開評価セットではありません。

## 成立確認と診断

検証はWindowsならPowerShellからも動く`.\verify.cmd`、macOS/Linuxなら`sh verify.sh`の一つのコマンドで実行します。PowerShellスクリプトの実行ポリシーは変更不要です。結果は人間向けの`artifacts/full-regression.md`と機械向けの`artifacts/full-regression.json`に保存します。このコマンドは単体テスト、旧210根本原因のV/F/N、追加75変種の専用V/F/N、選択10変種のV/Fを順次確認します。**現行500変種すべてのV/F/N成立確認とZAP/Burpの全体検出率測定は未実施です。** 成立確認の合格はZAP/Burpによる検出を意味しません。

```powershell
.\verify.cmd
```

macOS/Linuxでは`sh verify.sh`を実行します。

評価・集計・レポート用ツールの単体テストだけを確認する場合は、Windowsで`.\verify.cmd tools`、macOS/Linuxで`sh verify.sh tools`を使います。アプリやZAPを起動せず、制御キーも使いません。ネットワークなしのDockerで実行し、結果は`artifacts/tools-check.md`、`tools-check.json`、`tools-check.log`へ保存します。通常の`verify.cmd`／`verify.sh`は従来どおりアプリの統合検証を実行します。

保存された回帰結果、実験台帳、ZAP生成HTMLをまとめて探すには、Windowsで`.\reports.cmd`、macOS/Linuxで`sh reports.sh`を実行して`artifacts/index.html`を開きます。Dockerだけで利用でき、アプリやZAPを起動・変更せず、ネットワークなしで既存結果を読み取ります。完走・上限停止・失敗・未実行を別々に表示し、検出率や対策の成功は自動判定しません。実行中と記録された古い台帳は、現在動いているプロセスを示しません。

同じコマンドで`artifacts/artifact-audit.md`と`artifact-audit.json`も生成します。計画と実行JSONのハッシュ、台帳との条件・状態の一致、同一設定のV/F/N完走記録を監査します。未完了の系列や参照の不一致を残し、生のアラートから見逃し・検出を推定しません。ハッシュは保存資料同士の整合性を確認するもので、外部署名や現在のソースとの一致を保証しません。

`coverage-inventory.md`と`coverage-inventory.json`には、設計500変種と個別の成立確認記録の対応を保存します。旧形式のファイル単位の集計は別枠へ残し、個別変種の合格証拠としては数えません。表示は実行資料の棚卸しであり、現在のソースの合格や診断の検出率を示しません。

今後の`verify.cmd`／`verify.sh`による成立確認は、`acceptance.json`に開始時のソースSHA-256、設計JSON、固定seed、Node・ブラウザー版、終了時のソース照合結果を記録します。ソース記録が不正または実行中に変わった場合、棚卸しはその実行の合格セルを採用しません。過去の`acceptance.json`にはこれらを後付けせず、走査時のアプリイメージや全ホスト環境との一致もこの記録だけでは証明しません。

`evidence-overview.md`と`evidence-overview.json`は、比較領域・根本原因の主分類・根本原因ごとの資料を整理します。一部変種に個別V/F/N記録がある根本原因と、全変種に記録がある根本原因を分けます。診断のV/F/N完走資料も独立した項目として表示し、異なる系列のV・F・Nを合算して完了とは扱いません。同じ根本原因が複数の比較領域に属する場合、領域ごとの根本原因数を合計しないでください。

`evidence-linkage.md`と`evidence-linkage.json`は、監査済み台帳でZAPのV/F/Nが完走した変種について、個別成立記録の有無と次の確認事項を示します。台帳のない単独走査は別に扱うため、既存のB0002を含む全体の完走数とは1件異なります。旧成立記録と走査系列のソース・環境の一致を推定せず、記録の欠落をそのまま表示します。

2026-10-04の統合検証では代表210変種の630セル中629セルが合格し、R0226/B0226のVセルが履歴時刻の確認で失敗しました。この失敗を保持したまま、独立した追加75変種は225/225セルが合格し、各実行前後のソース指紋も一致しました。個別V/F/N合格記録が揃う変種は284/500です。ZAPで走査済みだが成立確認が不足していたSQL系4変種、ブラウザー出力系10変種、テンプレート・eval・ファイル・CORSの5変種を追加しました。ブラウザー出力とCORSはDocker内のChromiumで実動作を確認しました。代表検証と追加検証の全ソース指紋はテスト変更のため異なりますが、アプリとビルド関連110ファイルのハッシュは両実行で一致します。走査時のアプリソースとの対応付けや、ZAPの検出正誤は別途確認します。

新しい検証結果にはsrc、tests、Dockerfile、package manifests、Compose、設計JSONのソースSHA-256を保存します。結果一覧は、この記録を読み取り専用の現在のソースと比較し、「一致」「変更あり」「記録なし」を表示します。記録のない過去結果へ現在のハッシュを後付けしません。ドキュメントと生成資料はこの比較範囲に含めず、ソースが一致する場合も検証対象外の処理が合格したとは扱いません。

再現条件には`.dockerignore`、`verify.cmd`／`verify.sh`／`verify.ps1`、`reports.cmd`／`reports.sh`も含めます。NodeのベースイメージはDockerfileのdigestで固定していますが、実際の全コンテナーのimage ID、追加のOSパッケージ、ホスト資源の同一性はこのソース比較だけでは確認できません。

`verification-audit.md`と`verification-audit.json`には、検証JSONと保存ログのハッシュ・集計・終了状態・ソース記録を照合した結果を残します。「保存された合格」と「資料の整合性」を別々に表示し、ログ欠落や不一致があればその理由を記録します。

評価ツールの単体検証は、最新結果に加えて`artifacts/verification-history/`へ実行ごとのJSON・ログ・Markdownを保持します。再実行による上書きで過去の結果を失わず、結果一覧から履歴を参照できます。履歴の一致は実行当時の資料の整合性であり、現在のソースとの一致ではありません。

統合回帰も、レポート生成時と次回の統合検証開始前に、元のJSON・ログ・Markdownを履歴へ保存します。同じ内容は重複させず、変更があれば別の保存版として保持します。ログ欠落や不整合を含む資料も、その不足を残して保存します。`verification-history.md`に履歴・ソース比較・指摘の理由をまとめます。保存版の数は検証の実行回数や成立確認件数ではありません。

製品比較では、同じ根本原因・seed・V/F/N・認証条件を使い、ケース切替ごとに初期化します。診断対象は各ケースの`requiredTargetOrigins`に従います。通常は8443のworkspaceで、HTTP開始点や8444の収集先が必要なケースは対象を追加します。対応できない入口は`unsupported_target_surface`として未測定にし、見逃しに数えません。制御キー、oracle、正解データを診断エージェントへ渡さないでください。

製品・バージョン・add-on・設定hash・認証到達・診断時間・送信数・並行数を記録し、F/Nでの誤検出も確認します。アラート件数を検出数として直接使わず、根本原因ごとに通信と実影響をレビューします。既存add-on、独自add-on、Codexによる補助は別プロファイルです。

- [実装範囲と未実装分](README-coverage.md)
- [ZAPの実行手順と対応範囲](README-zap.md)
- [ZAPの検出漏れ・改善記録](README-zap-findings.md)
- [順次実行の計画](README-panel.md)
- [証拠レビューと集計](README-evaluation.md)
- [実装状態の機械可読記録](implementation-status.json)

現行runnerは通常のHTTP探索を中心にしています。OAuthのトークン更新、多段の業務フロー、ブラウザー操作、複数originへの到達支援、MCP駆動、Burpの実行アダプターは未実装または未測定です。状態を変える購入・キャッシュ等のケースは、診断の反復ごとに初期化してください。

## 管理者用の確認と終了

```powershell
docker compose exec -T app node src/control.mjs oracle
docker compose exec -T app node src/control.mjs mail-alice
docker compose down
```

oracleは非公開canaryや状態の正解確認に使います。対象ツールへ渡せるのは、正常な回復操作に必要なAliceの受信箱だけです。Bobの受信箱やoracleを渡すと評価条件が変わります。永続ボリュームは使用しないため、停止後の再起動でDB状態は初期化されます。生成した結果JSONはホストの`artifacts/`に残ります。

## オフライン単体検証の環境記録

新しい `tools-check.json` は、検証開始時の Node/V8/uv/OpenSSL/zlib、OS・アーキテクチャ、カーネルリリース、Linux配布版の ID/VERSION_ID、Nodeが報告する利用可能並列度、当該 cgroup v2 の `memory.max` / `cpu.max` を保存します。`tools-check.md` と結果一覧にも表示し、履歴JSONに保持します。取得不可・形式不正・対象外を区別し、過去の結果には後付けしません。

環境変数・引数・ホスト名・Dockerソケットは収集せず、Linuxでは3つの固定ローカルファイルだけを読みます。この記録の適用範囲はオフライン単体検証プロセスです。cgroup v1や親cgroupの制限、ピーク使用量、実際のDockerイメージID、追加OSパッケージ、ホスト全体の資源、ZAP・アプリ・成立確認の実行環境は未確認です。cgroup v2に上限がなくても、親やホストに制限がないという意味にはなりません。CPUはquota/periodをそのまま保存し、丸めたCPU台数には換算しません。

環境情報が存在する場合は既知の項目・値の形式・取得日時が検証の開始終了の範囲内にあることを監査します。これは記録の整合性確認であり、環境情報の真正性や性能の同等性を保証しません。
