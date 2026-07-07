# 対戦BGM音源

対戦画面のBGM。`App.tsx` の `BGM_SRC` が `/bgm/<track>.mp3` で参照する。
ファイル名は固定（`adventure` / `battle` / `casual` / `wafu`）。差し替えは同名で上書きするだけ（コード変更不要）。

## 現在の収録曲（初期セット）

| ファイル | 曲調 | 曲名 | 作者 / ライセンス |
|---|---|---|---|
| `adventure.mp3` | 冒険活劇 | Crossing the Chasm | Kevin MacLeod / CC BY 4.0 |
| `battle.mp3` | 緊迫バトル | Prelude and Action | Kevin MacLeod / CC BY 4.0 |
| `casual.mp3` | 軽快カジュアル | Sneaky Snitch | Kevin MacLeod / CC BY 4.0 |
| `wafu.mp3` | 和風・シリアス | Thief in the Night | Kevin MacLeod / CC BY 4.0 |

出典: incompetech.com（Kevin MacLeod）。全曲 **Creative Commons: By Attribution 4.0 License**。
→ クレジット表記が必須。アプリのハンバーガーメニュー内に1行表示している（`src/App.tsx`）。

## 差し替え候補（試聴して好みの曲へ）

- 魔王魂（商用可・報告不要・クレジット推奨）: https://maou.audio/category/game/game-battle/ , https://maou.audio/tag/%E5%86%92%E9%99%BA/
- DOVA-SYNDROME: https://dova-s.jp/bgm
- Pixabay Music（CC0・クレジット不要／要ダウンロード）: https://pixabay.com/music/search/pirate/

CC0（Pixabay 等）に全曲差し替えれば、メニューのクレジット行は不要。
和風の専用曲が欲しい場合は `wafu.mp3` を和風トラックへ差し替える。
