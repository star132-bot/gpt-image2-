# GPT Image 2 Launcher

一个可直接使用 `gpt-image-2` 的本地图片生成小工具。

特点：
- 本地代理模式，避免浏览器直连接口时的 CORS 问题
- Windows 启动版
- Linux / WSL 启动版
- 自动打开本地页面
- 自动保存生成图片到 `generated/`
- 支持历史记录

购买 / 获取模型密钥
- 购买地址：`https://ai.t8star.cn/token`

接口信息
- Base URL：`https://ai.t8star.cn/v1`
- Model：`gpt-image-2`
- 图片接口会由程序自动请求：`/images/generations`

用户需要把 URL 和密钥写到哪里
程序启动后，页面里有这几个输入框：

1. `API Key`
- 把你在 `https://ai.t8star.cn/token` 获取到的密钥填到这里
- 一般形如：`sk-xxxx`

2. `Base URL`
- 把接口地址填到这里
- 填写：`https://ai.t8star.cn/v1`

3. `Model`
- 填写：`gpt-image-2`

4. `Prompt`
- 填你要生成的图片描述

5. `Size`
- 选择图片尺寸，例如：`1024x1024`

使用方法

一、Windows 启动方法
要求：
- 安装 Node.js
- 安装并可使用 WSL

启动方式：
1. 打开项目目录
2. 双击：`open-gpt-image-window.bat`

或者命令行：
```bat
node desktop.js
```

注意：
- 这个 Windows 启动脚本内部会通过 `wsl.exe` 进入 WSL 目录运行
- 如果你是从 `\\wsl.localhost\...` 目录打开，也可以正常启动

二、Linux / WSL 启动方法
```bash
chmod +x open-gpt-image-window.sh
./open-gpt-image-window.sh
```

或者：
```bash
node desktop.js
```

三、只启动服务
```bash
node server.js
```
然后浏览器打开：
```text
http://127.0.0.1:3210
```

页面使用步骤
1. 启动程序
2. 浏览器自动打开本地页面 `http://127.0.0.1:3210`
3. 在 `API Key` 里填你的密钥
4. 在 `Base URL` 里填：`https://ai.t8star.cn/v1`
5. 在 `Model` 里填：`gpt-image-2`
6. 输入提示词
7. 点击 `Generate Image`
8. 生成后可以：
   - 直接预览图片
   - 点击“保存到本地”
   - 在右侧历史记录里查看之前生成的图片

项目文件说明
- `server.js`：本地 Node 代理服务
- `desktop.js`：启动服务并自动打开浏览器
- `open-gpt-image-window.bat`：Windows 启动脚本
- `open-gpt-image-window.sh`：Linux / WSL 启动脚本
- `app.js`：前端逻辑
- `index.html`：页面界面
- `styles.css`：页面样式
- `lib/shared.js`：共享逻辑
- `generated/`：保存生成图片的目录

安装与运行
```bash
npm install
npm test
node desktop.js
```

测试
```bash
npm test
```

默认值
页面默认已经带入：
- Base URL：`https://ai.t8star.cn/v1`
- Model：`gpt-image-2`

安全提醒
- 不要把你自己的 API Key 提交到 GitHub
- 页面会把配置保存在浏览器本地存储里，仅供本机使用
