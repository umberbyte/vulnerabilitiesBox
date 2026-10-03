# Web脆弱性診断ベンチマーク

ZAPとBurp Suite Professionalを同じ条件で比較するためのローカルWebアプリです。アプリは意図的に脆弱です。現在選択できるソースは312根本原因・448変種で、設計500変種の残り52変種は未実装です。[実装範囲と検証状態](README-coverage.md)に、成立確認済みの範囲と未測定項目をまとめています。Burpの実測はライセンス調達後です。

## 起動

Docker DesktopのLinux containersを起動し、このREADMEがある`web-benchmark`ディレクトリで実行します。初回はイメージを取得します。

```powershell
docker compose up --build -d --wait
docker compose exec -T app node src/control.mjs manifest
```

通常の入口は http://localhost:8080/ 、認証とブラウザー確認用の入口は https://localhost:8443/ です。8444は攻撃元または実験用収集サービスの別originです。公開ポートは127.0.0.1に限定し、DB・Redis・実行ワーカー・制御APIをホストに公開しません。`src/tls/local.crt`と`src/tls/local.key`は公開済みの実験専用fixtureです。実運用システムへ転用しないでください。

別のComposeプロジェクトを同時に起動する場合は、ホスト側のポートを変更できます。

```powershell
$env:BENCHMARK_HTTP_PORT = '18080'
$env:BENCHMARK_HTTPS_PORT = '18443'
$env:BENCHMARK_ATTACKER_PORT = '18444'
docker compose -p web-benchmark-validation up --build -d --wait db redis executor app
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

全体の成立確認を実行する場合、WindowsではPowerShellからも動く`.\verify.cmd`、macOS/Linuxでは`sh verify.sh`を使います。PowerShellスクリプトの実行ポリシーを変更する必要はありません。結果は`artifacts/acceptance.json`へ保存します。**現行448変種すべてのV/F/N成立確認と全体回帰はまだ実施していません。** 全体受入済みの履歴は210根本原因・V/F/N計630条件です。現行ソースの局所Docker確認は[選択10変種のV/F計20条件](artifacts/docker-smoke-selected.json)と追加4変種のV/F/N計12条件です。追加分は`docker compose --profile test run --build --rm -T verify node tests/batch6-cookie-shadow.mjs`、同じコマンドの`tests/batch6-tar.mjs`、`tests/batch6-uploads.mjs`で再確認できます。成立確認の合格はZAP/Burpによる検出を意味しません。

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
