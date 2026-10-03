# vulnerabilitiesBox

Web脆弱性診断ツールを比較するための、Docker上の**意図的に脆弱な**ローカル実験環境です。設計500変種のうち494変種（331根本原因）をソースに実装しています。全体のV/F/N成立確認済みの範囲は210根本原因、現行ソースでの局所Docker確認は選択10変種のV/F計20条件と追加50変種のV/F/N計150条件です。残り6変種は未実装で、ZAP/Burpの検出率や顧客環境への適用可否はまだ測定していません。

- [起動とケース切替](web-benchmark/README.md)
- [実装範囲と検証状態](web-benchmark/README-coverage.md)
- [ZAPの実行](web-benchmark/README-zap.md)・[実験計画](web-benchmark/README-panel.md)・[証拠評価](web-benchmark/README-evaluation.md)
- [500変種の設計データ](benchmark-design-v2.json)

Docker DesktopのLinux containersを起動し、`web-benchmark`で `docker compose up --build -d --wait` を実行します。既定の公開ポートはローカルホストの8080、8443、8444です。詳細は実行手順を参照してください。

このリポジトリには実験専用の自己署名TLS秘密鍵 `web-benchmark/src/tls/local.key` が含まれます。公開済みのfixtureとして扱い、この鍵や証明書を実運用システムに転用しないでください。診断ログ、管理者用計画、oracle、過去の受入結果は公開対象から外しています。
