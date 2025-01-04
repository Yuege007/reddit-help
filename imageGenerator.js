// 在文件开头添加
const DEBUG = false;  // 调试开关

// 改为全局变量定义
self.ImageGenerator = class ImageGenerator {
  constructor(options = {}) {
    this.options = {
      // 基础设置
      width: options.width || 1080,
      padding: options.padding || 65,
      backgroundColor: options.backgroundColor || '#ffffff',
      
      // 分别设置标题和正文字体
      titleFontFamily: options.titleFontFamily || '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial, sans-serif',
      contentFontFamily: options.contentFontFamily || '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial, sans-serif',
      
      // 头部区域设置
      headerHeight: 160,
      headerPadding: options.headerPadding || 60,
      iconSize: 80,
      subredditFontSize: 32,
      authorFontSize: 24,
      authorSpacing: 24,
      iconTextSpacing: 16,
      qSize: 80,
      qColor: '#000000',
      authorColor: '#ff2442',
      
      // 标题区域设置
      titleAreaSpacing: options.titleAreaSpacing || 60,
      titleFontSize: options.titleFontSize || 50,
      titleLineHeight: options.titleLineHeight || 1.4,
      titleLetterSpacing: options.titleLetterSpacing || 0,
      titleColor: options.titleColor || '#333333',
      
      // 正文区域设置
      contentAreaSpacing: 40,
      contentFontSize: options.contentFontSize || 32,
      contentLineHeight: options.contentLineHeight || 1.8,
      contentLetterSpacing: options.contentLetterSpacing || 0,
      textColor: options.textColor || '#3f3f3f',
      
      // 回答模式设置
      answerAuthorFontSize: options.answerAuthorFontSize || 32,
      answerAuthorSpacing: options.answerAuthorSpacing || 45,
      authorContentSpacing: options.authorContentSpacing || 40,
      commentSpacing: 60,
      
      // 回答模式正文设置
      answerContentFontSize: options.answerContentFontSize || 32,
      answerContentLineHeight: options.answerContentLineHeight || 1.8,
      answerContentLetterSpacing: options.answerContentLetterSpacing || 0,
      answerContentFontFamily: options.answerContentFontFamily || '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", Arial, sans-serif',
      
      // 其他设置
      aspectRatio: 1.333333,
      fontWeight: 'bold',
    };
  }

  // 修改加载图片的辅助方法
  loadImage(url) {
    return new Promise((resolve, reject) => {
      if (!url) {
        console.warn('No URL provided for image loading');
        resolve(null);
        return;
      }

      console.log('Starting to load image:', url);
      
      fetch(url)
        .then(response => {
          console.log('Image fetch response:', response);
          return response.blob();
        })
        .then(blob => {
          console.log('Image blob:', blob);
          return createImageBitmap(blob);
        })
        .then(bitmap => {
          console.log('Image bitmap created:', bitmap);
          resolve(bitmap);
        })
        .catch(error => {
          console.error('Failed to load image:', error);
          resolve(null);  // 失败时返回 null 而不是拒绝 Promise
        });
    });
  }

  // 绘制圆形图标
  drawCircularIcon(ctx, bitmap, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(bitmap, x, y, size, size);
    ctx.restore();
  }

  wrapText(ctx, text, x, y, maxWidth, lineHeight, justify = false) {
    // 处理数组类型的文本
    if (Array.isArray(text)) {
      let currentY = y;
      text.forEach((paragraph, index) => {
        // 处理包含换行符的段落
        const lines = paragraph.split('\n').map(line => line.trim());
        lines.forEach((line, lineIndex) => {
          // 处理列表项
          if (line.startsWith('*')) {
            // 计算缩进级别
            const indentLevel = (line.match(/^\s*/)[0].length / 2);
            const indent = indentLevel * 20; // 每级缩进20像素
            
            // 移除列表标记并添加圆点
            line = '• ' + line.replace(/^\s*\*\s*/, '').trim();
            
            currentY = this.wrapParagraph(
              ctx, 
              line, 
              x + indent, 
              currentY, 
              maxWidth - indent, 
              lineHeight, 
              justify
            );
          } else {
            currentY = this.wrapParagraph(
              ctx, 
              line, 
              x, 
              currentY, 
              maxWidth, 
              lineHeight, 
              justify
            );
          }
          
          // 添加适当的行间距
          if (lineIndex < lines.length - 1) {
            currentY += lineHeight * 0.3;
          }
        });
        
        // 段落之间添加更大的间距
        if (index < text.length - 1) {
          currentY += lineHeight * 0.8;
        }
      });
      return currentY;
    }
    
    return this.wrapParagraph(ctx, text, x, y, maxWidth, lineHeight, justify);
  }

  wrapParagraph(ctx, text, x, y, maxWidth, lineHeight, justify = false) {
    if (!text) {
      console.warn('Invalid text in wrapParagraph:', text);
      return y;
    }

    // 确保text是字符串
    text = text.toString();
    
    // 使用Array.from来正确分割包含emoji的字符串
    const chars = Array.from(text);
    let line = '';
    const lines = [];
    
    // 修改字体判断逻辑
    const currentFont = ctx.font;
    const isAnswer = currentFont.includes(this.options.answerContentFontSize.toString());
    
    // 根据模式选择正确的字体和间距
    let letterSpacing = 0;  // 添加变量声明
    if (isAnswer) {
      // 回答模式
      letterSpacing = this.options.answerContentLetterSpacing;
    } else {
      // 问题模式
      const isTitle = currentFont.includes(this.options.titleFontSize.toString());
      letterSpacing = isTitle ? this.options.titleLetterSpacing : this.options.contentLetterSpacing;
    }
    
    // 检查是否包含emoji
    const hasEmoji = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F910}-\u{1F96B}\u{1F980}-\u{1F9E0}]/gu.test(text);
    
    if (hasEmoji) {
      // 确保使用支持emoji的字体
      const currentFont = ctx.font;
      if (!currentFont.includes('Emoji')) {
        ctx.font = currentFont.replace(/^([^,]+,|)/, '$1"Segoe UI Emoji",');
      }
    }
    
    for (let char of chars) {
      const testLine = line + char;
      const metrics = ctx.measureText(testLine);
      const totalWidth = metrics.width + (testLine.length - 1) * letterSpacing;
      
      if (totalWidth > maxWidth) {
        if (line) lines.push(line);
        line = char;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    let currentY = y;
    lines.forEach((line, index) => {
      if (justify && index < lines.length - 1) {
        const totalWidth = maxWidth;
        const textWidth = ctx.measureText(line).width + (line.length - 1) * letterSpacing;
        const extraSpace = (totalWidth - textWidth) / (line.length - 1);
        
        let currentX = x;
        for (let i = 0; i < line.length; i++) {
          ctx.fillText(line[i], currentX, currentY);
          if (i < line.length - 1) {
            currentX += ctx.measureText(line[i]).width + letterSpacing + extraSpace;
          }
        }
      } else {
        let currentX = x;
        // 使用Array.from来正确遍历包含emoji的行
        const lineChars = Array.from(line);
        for (let i = 0; i < lineChars.length; i++) {
          ctx.fillText(lineChars[i], currentX, currentY);
          currentX += ctx.measureText(lineChars[i]).width + letterSpacing;
        }
      }
      currentY += lineHeight;
    });

    // 添加日志
    DEBUG && console.log('Font settings:', {
      isTitle,
      fontFamily,
      currentFont: ctx.font,
      options: this.options
    });

    return currentY;
  }

  measureTextHeight(ctx, text, fontSize, maxWidth) {
    if (!text) {
      console.warn('Empty text provided to measureTextHeight');
      return 0;
    }

    const fontFamily = fontSize === this.options.titleFontSize ? 
      this.options.titleFontFamily : 
      this.options.contentFontFamily;
    
    ctx.font = `${fontSize === this.options.titleFontSize ? 'bold' : ''} ${fontSize}px ${fontFamily}`;
    
    const lineHeight = fontSize === this.options.titleFontSize ? 
      fontSize * this.options.titleLineHeight : 
      fontSize * this.options.contentLineHeight;
    
    if (Array.isArray(text)) {
      let totalHeight = 0;
      text.forEach((paragraph, index) => {
        if (paragraph) {
          const lines = this.measureParagraphLines(ctx, paragraph, maxWidth);
          totalHeight += lines.length * lineHeight;
          if (index < text.length - 1) {
            totalHeight += lineHeight * 0.8;
          }
        }
      });
      return totalHeight;
    }
    
    const lines = this.measureParagraphLines(ctx, text, maxWidth);
    return lines.length * lineHeight;
  }

  measureParagraphLines(ctx, text, maxWidth) {
    if (!text) {
      console.warn('Invalid text in measureParagraphLines:', text);
      return [];
    }

    const chars = text.toString().split('');
    let line = '';
    const lines = [];

    for (let char of chars) {
      const testLine = line + char;
      if (ctx.measureText(testLine).width > maxWidth) {
        if (line) lines.push(line);
        line = char;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    return lines;
  }

  async generateImage(content) {
    try {
      // 添加内容验证
      if (!content) {
        throw new Error('No content provided for image generation');
      }

      // 首先创建 canvas 和 ctx
      const canvas = new OffscreenCanvas(this.options.width, Math.round(this.options.width * this.options.aspectRatio));
      const ctx = canvas.getContext('2d');

      // 设置背景色
      ctx.fillStyle = this.options.backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let y = this.options.headerPadding;

      // 加载图标
      let iconImg = null;
      if (content.subredditIcon) {
        try {
          iconImg = await this.loadImage(content.subredditIcon);
        } catch (error) {
          console.error('Failed to load subreddit icon:', error);
        }
      }

      // 绘制头部
      y = await this.drawHeader(ctx, content, iconImg, y);

      if (content.isAnswer) {
        // 添加评论内容验证
        if (!content.comments || !content.comments[0] || !content.comments[0].content) {
          console.error('Invalid comment content:', content);
          throw new Error('Invalid comment content');
        }

        // 添加日志
        console.log('Processing comment with content:', content.comments[0].content);

        // 使用回答模式的配置
        ctx.font = `${this.options.answerContentFontSize}px ${this.options.answerContentFontFamily}`;
        ctx.fillStyle = this.options.textColor;
        
        // 设置字间距
        const letterSpacing = this.options.answerContentLetterSpacing || 0;
        
        // 处理评论内容
        const commentText = content.comments[0].content;
        if (!commentText) {
          throw new Error('Empty comment text');
        }

        y = this.wrapText(
          ctx,
          commentText,
          this.options.padding,
          y,
          this.options.width - 2 * this.options.padding,
          this.options.answerContentFontSize * this.options.answerContentLineHeight,
          true,
          letterSpacing
        );
      } else {
        // 问题模式的处理
        if (!content.title) {
          throw new Error('Question content must have a title');
        }

        const titleText = content.translatedTitle || content.title;
        const contentText = content.translatedContent || content.content;

        // 绘制标题
        ctx.font = `bold ${this.options.titleFontSize}px ${this.options.titleFontFamily}`;
        ctx.fillStyle = this.options.titleColor;
        y += this.options.titleAreaSpacing;
        y = this.wrapText(
          ctx,
          titleText,
          this.options.padding,
          y,
          this.options.width - 2 * this.options.padding,
          this.options.titleFontSize * this.options.titleLineHeight,
          false
        );

        // 绘制正文
        if (contentText) {
          y += this.options.contentAreaSpacing;
          ctx.font = `${this.options.contentFontSize}px ${this.options.contentFontFamily}`;
          ctx.fillStyle = this.options.textColor;
          y = this.wrapText(
            ctx,
            contentText,
            this.options.padding,
            y,
            this.options.width - 2 * this.options.padding,
            this.options.contentFontSize * this.options.contentLineHeight,
            true
          );
        }
      }

      // 转换为 blob
      const blob = await canvas.convertToBlob({
        type: 'image/png'
      });

      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });

    } catch (error) {
      console.error('Error in generateImage:', error);
      throw error;
    }
  }

  // 在 ImageGenerator 类中添加 drawHeader 方法
  async drawHeader(ctx, content, iconImg, y) {
    // 绘制图标
    if (iconImg) {
      const iconSize = this.options.iconSize;  // 默认是 80
      const iconX = this.options.padding;
      const iconY = y;
      
      console.log('Drawing icon with:', {
        iconSize,
        iconX,
        iconY,
        iconImgSize: {
          width: iconImg.width,
          height: iconImg.height
        }
      });
      
      // 绘制圆形图标 - 确保图标足够大
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconX + iconSize/2, iconY + iconSize/2, iconSize/2, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      
      // 计算缩放��例，确保图标填满圆形区域
      const scale = Math.max(iconSize / iconImg.width, iconSize / iconImg.height);
      const scaledWidth = iconImg.width * scale;
      const scaledHeight = iconImg.height * scale;
      
      // 居中绘制
      const offsetX = (iconSize - scaledWidth) / 2;
      const offsetY = (iconSize - scaledHeight) / 2;
      
      ctx.drawImage(
        iconImg,
        iconX + offsetX,
        iconY + offsetY,
        scaledWidth,
        scaledHeight
      );
      
      ctx.restore();
    }

    // 设置字体 - 统一使用加粗样式
    ctx.font = `bold ${this.options.subredditFontSize}px ${this.options.contentFontFamily}`;
    ctx.fillStyle = this.options.textColor;

    // 绘制 subreddit 名称 - 与图标垂直居中对齐
    const subredditX = this.options.padding + this.options.iconSize + this.options.iconTextSpacing;
    const subredditY = y + this.options.iconSize/2 + this.options.subredditFontSize/3;
    ctx.fillText(content.subreddit, subredditX, subredditY);

    // 绘制问答标识
    ctx.font = `bold ${this.options.qSize}px ${this.options.contentFontFamily}`;
    ctx.fillStyle = content.isAnswer ? this.options.authorColor : this.options.qColor;
    const qX = this.options.width - this.options.padding - this.options.qSize;
    const qY = y + this.options.qSize;
    ctx.fillText(content.isAnswer ? 'A' : 'Q', qX, qY);

    // 如果是回答模式，作者名称在顶部容器下方单独绘制
    if (content.isAnswer) {
      y += this.options.headerHeight + this.options.answerAuthorSpacing;
      ctx.font = `${this.options.answerAuthorFontSize}px ${this.options.contentFontFamily}`;
      ctx.fillStyle = this.options.authorColor;
      ctx.fillText(`@${content.comments[0].author}`, this.options.padding, y);
      y += this.options.authorContentSpacing;
    } else {
      // 问题模式的作者名称仍顶部容器内
      ctx.font = `${this.options.authorFontSize}px ${this.options.contentFontFamily}`;
      ctx.fillStyle = this.options.authorColor;
      const authorY = subredditY + this.options.authorSpacing;
      ctx.fillText(`@${content.author}`, subredditX, authorY);
      y += this.options.headerHeight;
    }

    return y;
  }
}; 