# 开发者文档

## 技术架构
- 前端: HTML/CSS/JavaScript
- 存储: Chrome Storage API
- 翻译: OpenAI API
- 图片生成: HTML Canvas

## 核心模块
- 内容提取器: 解析Reddit页面DOM
- 翻译引擎: 调用OpenAI API进行翻译
- 编辑器: 支持实时编辑和预览
- 渲染器: 将内容转换为图片

## 数据流
1. 页面加载 -> 内容提取
2. 内容提取 -> 翻译处理
3. 翻译处理 -> 编辑预览
4. 编辑预览 -> 图片生成

## 开发环境
1. 克隆仓库
```bash
git clone https://github.com/your-username/reddit-to-xiaohongshu.git
```

2. 安装依赖
```bash
npm install
```

3. 本地开发
```bash
npm run dev
```

4. 构建插件
```bash
npm run build
```

## 代码规范
- 使用ESLint进行代码检查
- 遵循JavaScript Standard Style
- 使用Prettier进行代码格式化

## 测试指南
- 单元测试: Jest
- E2E测试: Puppeteer
- 运行测试: `npm test` 