# Dynamic Spoof Geolocation

A Chrome browser extension that spoofs geolocation data with advanced features including movement simulation and randomization.

## Features

- **Fixed Location Mode**: Set a specific latitude and longitude
- **Moving Mode**: Simulate movement with configurable speed and bearing
- **Randomization**: Add random variation to location within a specified range
- **Per-Tab Settings**: Each tab maintains independent geolocation settings
- **Real-time Updates**: Watch position callbacks return simulated data

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right toggle)
4. Click "Load unpacked" and select this directory
5. The extension will appear in your browser toolbar

## Usage

1. Navigate to a website that uses geolocation
2. Click the extension icon in your browser toolbar
3. Configure your settings:
   - **Latitude/Longitude**: Base coordinates for spoofing
   - **Mode**: Choose "fixed" or "moving"
   - **Moving Options**: Speed (km/h) and bearing (degrees)
   - **Accuracy**: Simulated GPS accuracy in meters
   - **Heading/Speed**: Additional GPS data (optional)
   - **Randomize**: Enable random position variation
   - **Random Range**: Maximum offset in meters
4. Click "Apply" to start spoofing
5. Click "Stop" to return to real GPS data

## Files

- `manifest.json`: Extension configuration
- `background.js`: Service worker for extension logic
- `content.js`: Content script injected into web pages
- `geolocation-spoof.js`: Core geolocation spoofing logic
- `popup.html`: Extension popup UI
- `popup.js`: Popup interface logic

## License

MIT

---

# Dynamic Spoof Geolocation [日本語]

移動シミュレーションやランダム化機能を備えた、地理位置情報を偽装するChromeブラウザ拡張機能です。

## 機能

- **固定位置モード**: 特定の緯度と経度を設定
- **移動モード**: 速度と方角を設定して移動をシミュレート
- **ランダム化**: 指定範囲内で位置情報にランダムな変動を追加
- **タブごとの設定**: 各タブで独立した位置情報設定を維持
- **リアルタイム更新**: ウォッチポジションコールバックがシミュレートされたデータを返却

## インストール方法

1. リポジトリをダウンロードまたはクローン
2. Chromeで `chrome://extensions/` に移動
3. 「デベロッパーモード」を有効化（右上のトグル）
4. 「パッケージ化されていない拡張機能を読み込む」をクリックしてこのディレクトリを選択
5. 拡張機能がブラウザツールバーに表示されます

## 使用方法

1. 位置情報を使用するWebサイトに移動
2. ブラウザツールバーの拡張機能アイコンをクリック
3. 設定を構成:
   - **緯度/経度**: 偽装のベース座標
   - **モード**: 「固定」または「移動」を選択
   - **移動オプション**: 速度（km/h）と方角（度）
   - **精度**: シミュレートされたGPS精度（メートル）
   - **方位/速度**: 追加のGPSデータ（オプション）
   - **ランダム化**: ランダムな位置変動を有効化
   - **ランダム範囲**: 最大オフセット（メートル）
4. 「適用」をクリックして偽装を開始
5. 「停止」をクリックして実際のGPSデータに戻す

## ファイル構成

- `manifest.json`: 拡張機能の設定
- `background.js`: 拡張機能のロジックを担当するサービスワーカー
- `content.js`: Webページに注入されるコンテンツスクリプト
- `geolocation-spoof.js`: 位置情報偽装のコアロジック
- `popup.html`: 拡張機能のポップアップUI
- `popup.js`: ポップアップインターフェースのロジック

## ライセンス

MIT
