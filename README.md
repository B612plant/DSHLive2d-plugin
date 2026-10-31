# DSHLive2D

<img src="assets/icon.webp" alt="DSHLive2D" width="128" />

让 Live2D 角色陪你使用 DeepSeek Harness：支持桌面悬浮、动作预览，以及 Agent 根据对话选择动作。

作者：小红书号 **4190947207** · GitHub：[B612plant](https://github.com/B612plant)

## 安装

1. 在 DeepSeek Harness 的插件管理中添加 npm 插件：`dsh-plugin-live2d-stage`。
2. 安装后重启 Harness。
3. 打开 **设置 → DSHLive2D**，启用「Harness 内使用」。

初始模型为 **DeepSeek-chan（大肥鱼）**，附带 8 个动作（含待机）及 23 个表情，首次使用无需导入模型。

这是社区插件。Harness 内使用支持 Harness Web；桌面悬浮支持 **Windows x64**，需要系统已安装 WebView2 Runtime。已适配 Harness Desktop 0.2.0-rc.2。

## 使用

- **眼神跟随**：鼠标移动时角色自然注视鼠标，桌面悬浮时也支持窗口外追踪；播放动作时优先保留动作演出，无需消耗 token。
- **切换角色**：在设置中选择角色，动作、表情目录和 Agent 的当前模型说明随之切换；导入其他模型不会自动切换当前角色。
- **导入模型**：上传包含 `.moc3` 和纹理的 ZIP，每个 ZIP 一个角色；建议保留原始 `.model3.json`。
- **动作控制**：开启后，Agent 查看独立的动作和表情 JSON 目录，目录在对话中缓存复用，每次回复各选一个，一次提交到播放器。重复组合会再次播放，不等待或查询播放回执。导入后即可使用，建议按实际表现修改名称。
- **调整位置**：直接拖拽角色移动画布；双击进入调整，拖动人物改变位置、滚轮缩放人物、拖动画布边缘调整大小；按 **Esc 保存并退出**。

人物右侧按钮从上到下：

| 按钮 | 用途 |
| --- | --- |
| 文本 | 打开对话，使用当前 Harness 的工作区和会话 |
| 动作 | 预览当前角色的动作 |
| 拖拽 | 移动画布 |
| 重置 | 恢复默认大小和右下角位置 |
| 移出／移入 | 在 Harness 内显示与桌面悬浮之间切换 |
| 关闭 | 关闭人物、桌面悬浮和 Agent 动作控制 |

关闭后可在设置中重新启用。桌面对话需要 Harness 保持运行。消息直接交给 Harness 原生会话服务，沿用所选会话的模型和权限配置，权限确认仍在主窗口处理。输入区的「＋」会打开对应的 Harness 原生会话，并追加当前草稿（保留宿主已有草稿）；请在原生输入区选择文件并发送附件。插件不提供独立的文件选择、上传或附件处理流程。

## 数据与许可

角色和配置默认保存在 `%USERPROFILE%\.dsh\live2d-stage`；设置 `DSH_HOME` 后使用其下的 `live2d-stage` 目录。升级插件不会覆盖已导入的模型。

每个模型的目录在初次导入时生成，分别保存在 `catalogs/<角色ID>/motions.json` 和 `catalogs/<角色ID>/expressions.json`。升级已有安装时会补建缺失的目录，并保留之前修改的名称。设置中改名只更新对应 JSON 中该项目的名称，不重建目录，也不改变动作 ID 或资源文件。

Agent 首次通过 `live2d_list_motions` 和 `live2d_list_expressions` 查看这两个 JSON，随后复用目录；仅在切换模型、对应目录改名导致版本变化或上下文缺少目录时重新获取。插件端使用内存缓存，通过 `live2d_present` 同时提交 `motionId` 和 `expressionId`；某类资源为空时该项传 `null`。播放器通过长连接即时接收，不做动作组合去重。模型未显示或连接断开期间的演出不会在重连后补播。提示词包含选择规则、当前角色 ID 和两份目录的版本，启动时恢复；切换模型更新角色信息，改名只更新对应目录版本以通知 Agent 刷新，播放动作或表情不改变这些信息。

### 初始模型与制作人员

- **模型名称**：DeepSeek-chan（大肥鱼），神宫凉子免费配布模型。
- **原画、拆分及模型发布**：[神宫凉子 · Bilibili 主页](https://space.bilibili.com/13737731)。
- **Live2D 建模**：[霓虹猫_NeonNeko · Bilibili 主页](https://space.bilibili.com/3546725618813315)。

感谢原作者与建模师提供模型。模型版权归各自作者所有，插件作者仅负责程序开发与模型接入。

完整原始模型文件保存在 [character/deepseek](character/deepseek)，包括纹理、动作、表情、VTube Studio 配置与使用须知；插件仅在运行时补充动作和表情索引，保留仓库内的原始文件及目录结构。

请阅读随包的 [DeepSeek 免费 Live2D 模型使用须知](character/deepseek/DeepSeek免费%20Live2D%20模型使用须知.txt)。须知要求公开使用时署名，并禁止擅自重新分发完整模型文件；将含模型的仓库或插件包公开上传前，须取得作者的另行授权。推荐模型时请分享作者的原始获取页面。

Cubism SDK 和其他第三方组件仍受各自许可约束，详见 [licenses](licenses)。

## 开发

本仓库可独立构建：

```sh
npm ci
npm run build
npm test
```

已包含编译好的 Windows 悬浮程序。修改 C# 后，按 `native/dependency.json` 获取并校验 SDK，再执行：

```powershell
powershell -NoProfile -File native/build.ps1 -SdkDirectory <SDK目录>
```
