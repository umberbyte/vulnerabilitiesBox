# vulnerabilitiesBox

Web脆弱性診断ツールを比較するための、Docker上の**意図的に脆弱な**ローカル実験環境です。現行ソースは設計500変種のうち444変種（312根本原因）で、残り56変種は未実装です。全体受入済みの最新リリースは210件版で、現行版では追加10変種のV/F計20条件のみDocker上で局所確認しました。ZAP/Burpによる検出率や顧客環境への適用可否はまだ測定していません。

- [設計データ](benchmark-design-v2.json)
- [実行・評価手順](web-benchmark/README.md)
- [今回の進捗と残り56変種](web-benchmark/README-batch-05-progress.md)
- [局所Docker確認の結果](web-benchmark/artifacts/batch5-docker-smoke.json)

Docker DesktopのLinux containersを起動し、`web-benchmark`で `docker compose up --build -d --wait` を実行します。既定の公開ポートはローカルホストの8080、8443、8444です。詳細は実行手順を参照してください。

このリポジトリには実験専用の自己署名TLS秘密鍵 `web-benchmark/src/tls/local.key` が含まれます。公開済みのfixtureとして扱い、この鍵や証明書を実運用システムに転用しないでください。診断ログ、管理者用計画、oracle、過去の受入結果は公開対象から外しています。`web-benchmark/README*.md` の履歴リンクには、ローカル作業環境でのみ生成したartifactを指すものがあります。
