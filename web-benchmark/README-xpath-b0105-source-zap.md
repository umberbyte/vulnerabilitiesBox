# B0105 の成立確認とZAP再計測（2026-10-05）

ローカルDocker上でB0105（XPath）の[個別V/F/N成立確認](artifacts/acceptance-saved-xpath-b0105-source-20261005.json)を実行し、3セル・48チェックすべてが通過した。確認前後の対象ソース証拠も一致した。外部・顧客システムには通信していない。

[計画](artifacts/panel-xpath-b0105-source-20261005.json)と[実行台帳](artifacts/panel-xpath-b0105-source-20261005-ledger.json)によるZAP再計測は、session認証・active profile・seed `acceptance-v1`・90秒/700リクエストの条件でV/F/Nの3セルすべてが`completed`、エラー0、通信drain完了となった。成立確認とスキャン時の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認時のリポジトリ全体のソース証拠は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`である。依存サービスとホスト環境全体の状態一致は未証明である。

| arm | 実行リクエスト | ZAPアラート | 人間が読めるZAPレポート |
| --- | ---: | ---: | --- |
| V | 659 | 16 | [HTML](artifacts/zap-2026-10-05T08-26-56-153Z-a21001/zap-report.html) |
| F | 659 | 16 | [HTML](artifacts/zap-2026-10-05T08-27-34-227Z-a133c8/zap-report.html) |
| N | 659 | 16 | [HTML](artifacts/zap-2026-10-05T08-28-11-733Z-1fd0c2/zap-report.html) |

アラートのplugin ID別件数はV/F/Nで同じだった。XPathに固有の検出はこのアラート比較からは確認できず、ヘッダー等の共通警告をXPathの真陽性とは数えない。個別の対象HTTP通信と成立条件の照合を経るまで、検出率は未確定とする。

当初はB0099～B0102のLDAP代表4件も同じ`tests/acceptance.mjs`で確認しようとしたが、この確認器には当該rootの定義がなく、12セルが`Uncovered root`で失敗した。B0105の3セルだけが通過した混合実行の[失敗原票](artifacts/failed-attempts/acceptance-saved-ldap-xpath-five-source-20261005.json)は保存したが、正式な成立確認の集計対象からは外した。これはLDAP実装の脆弱性不成立を示さない。LDAPの4件には、対応する個別確認器と対象ソース証拠を合わせた実行手順が必要である。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みは105から106変種、個別記録はあるがソース未対応は153から152変種になった。V/F/Nの完了スキャンがある258変種、依存環境まで完全対応済み0変種は変わらない。
