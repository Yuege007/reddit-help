importScripts('imageGenerator.js');

self.onmessage = async function(e) {
  try {
    console.log('Worker received message:', e.data);
    const { content, config, previewType } = e.data;
    
    console.log('Worker received config:', config);
    
    if (!content) {
      throw new Error('No content provided to worker');
    }

    const generator = new self.ImageGenerator(config);
    
    let imageData;
    console.log('Starting image generation for type:', previewType);
    
    if (previewType === 'question') {
      console.log('Generating question preview with content:', content);
      if (!content.title) {
        throw new Error('Question content must have a title');
      }
      imageData = await generator.generateImage({
        ...content,
        isAnswer: false
      });
    } else {
      if (content.comments && content.comments.length > 0) {
        console.log('Generating answer preview with comments:', content.comments);
        const validComments = content.comments
          .filter(comment => comment && comment.content && comment.author)
          .slice(0, 3);
          
        if (validComments.length === 0) {
          throw new Error('没有找到有效的评论');
        }

        imageData = await generator.generateImage({
          comments: validComments,
          subreddit: content.subreddit,
          subredditIcon: content.subredditIcon,
          isAnswer: true
        });
      } else {
        throw new Error('没有找到评论');
      }
    }
    
    console.log('Image generation completed');
    self.postMessage({ success: true, imageData });
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({ success: false, error: error.message });
  }
}; 