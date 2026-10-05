# 内部サービス境界3変種の成立確認とZAP再計測

2026-10-05にB0463（backend TLS検証無効）、B0466（管理port公開）、B0480（内部queue任意管理）をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-internal-three-source-20261005.json)は3変種・9セルすべて合格し、[セル別記録](artifacts/docker-smoke-internal-three-source-20261005.json)を保存した。外部・顧客システムは対象にしていない。

[計画](artifacts/panel-internal-three-source-20261005.json)と[台帳](artifacts/panel-internal-three-source-20261005-ledger.json)にZAPの9セルを保存した。全セルは`completed`、実行エラー0、通信履歴の保存とdrainは完了した。seedは`batch5-docker-smoke`、profileは`active`、session認証、指定上限は90秒・700リクエスト、並列2リクエスト。成立確認と各ZAPセルの対象アプリ実行ソースSHA-256は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`で一致した。依存サービスやホスト環境全体の一致までは証明していない。

| 変種 | V/F/Nの実行リクエスト数 | V/F/Nの保存済みZAP通信数 | V/F/Nの全アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0463 | 456/456/456 | 396/396/396 | 27/27/27 | [V](artifacts/zap-2026-10-05T07-22-23-768Z-82c400/zap-report.html)・[F](artifacts/zap-2026-10-05T07-22-51-708Z-f985bf/zap-report.html)・[N](artifacts/zap-2026-10-05T07-23-19-133Z-7759f2/zap-report.html) |
| B0466 | 240/240/240 | 169/169/169 | 13/13/13 | [V](artifacts/zap-2026-10-05T07-23-46-506Z-a2c644/zap-report.html)・[F](artifacts/zap-2026-10-05T07-24-04-201Z-004474/zap-report.html)・[N](artifacts/zap-2026-10-05T07-24-21-858Z-48c07a/zap-report.html) |
| B0480 | 665/665/665 | 607/607/607 | 26/26/26 | [V](artifacts/zap-2026-10-05T07-24-39-544Z-37f364/zap-report.html)・[F](artifacts/zap-2026-10-05T07-25-17-018Z-29791a/zap-report.html)・[N](artifacts/zap-2026-10-05T07-25-54-513Z-e88624/zap-report.html) |

保存済み通信では各変種の入口への到達を確認した。一方、B0463の未信頼TLS peer、B0466の管理経路、B0480の他人のqueue操作に到達した証拠はなかった。保存済みアラートをplugin ID・URL・HTTPメソッド・パラメータ単位で照合した範囲では、各変種のVだけに出るアラートはなく、Highアラートも0件だった。入口への到達やアラート数だけでTP/FNを確定しない。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが91から94変種、個別成立記録はあるがソース対応未確認が167から164変種となった。V/F/N完走系列がある変種は258のまま、依存環境の完全対応済みは0のままである。
