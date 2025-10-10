# Pym.js Integration Guide

This project has been configured to work with pym.js, enabling it to be embedded as a responsive iframe in any parent page with automatic height adjustment.

## What is Pym.js?

Pym.js is a library that makes it easy to embed and resize responsive content in an iframe. It automatically:
- Adjusts the iframe height based on the child content
- Handles responsive resizing
- Works across different domains (CORS-friendly)

## Implementation Details

### Child Configuration (This Svelte App)

The pym.js child is initialized in `/myapp/src/routes/+layout.svelte`:

```javascript
import pym from 'pym.js';

onMount(() => {
  // Initialize pym.js child with polling every 500ms
  pymChild = new pym.Child({ polling: 500 });

  return () => {
    if (pymChild) {
      pymChild.remove();
    }
  };
});
```

The child automatically:
- Sends height updates to the parent window
- Polls for height changes every 500ms
- Works across all pages and components in your app

### Parent Page Integration

To embed this app in a parent page, use the following code:

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://pym.nprapps.org/pym.v1.min.js"></script>
    <style>
        /* Container styling - adjust height as needed */
        #iframe-container {
            width: 100%;
            min-height: 800px;
            height: calc(100vh - 150px); /* Adjust 150px to your header height */
            position: relative;
        }

        /* Ensure iframe allows all interactions */
        #iframe-container iframe {
            pointer-events: auto !important;
            touch-action: auto !important;
            border: none;
            width: 100%;
        }
    </style>
</head>
<body>
    <div id="iframe-container"></div>

    <script>
        const pymParent = new pym.Parent('iframe-container', 'YOUR_APP_URL', {
            title: 'Occupation Sols',
            scrollwait: 100
        });

        // Ensure iframe allows all interactions after creation
        pymParent.iframe.setAttribute('scrolling', 'no');
        pymParent.iframe.style.pointerEvents = 'auto';
        pymParent.iframe.style.touchAction = 'auto';
    </script>
</body>
</html>
```

**IMPORTANT for WordPress/CMS:** If embedding in WordPress or another CMS, make sure to:
1. Use the "Custom HTML" block, not the "Embed" block
2. Add this CSS to your theme or page:
```css
.pym-container iframe {
    pointer-events: auto !important;
    touch-action: auto !important;
    min-height: 800px !important;
}
```

## Testing

1. **Start the development server:**
   ```bash
   cd myapp
   npm run dev
   ```

2. **Open the test parent page:**
   Open `myapp/test-parent.html` in your browser (you may need to serve it through a web server)

3. **For production:**
   ```bash
   npm run build
   npm run preview
   ```

## Configuration Options

### Child Options
```javascript
new pym.Child({
  polling: 500,              // Poll interval in ms (default: 0 - disabled)
  renderCallback: () => {}, // Callback after first render
  id: 'custom-id'           // Custom ID for the iframe
});
```

### Parent Options
```javascript
new pym.Parent('container-id', 'child-url', {
  xdomain: '*',                // Allowed origin (default: *)
  title: 'Title',              // Iframe title
  name: 'name',                // Iframe name
  scrollwait: 100,             // Scroll event throttle (ms)
  parenturlparam: 'parentUrl'  // URL parameter name
});
```

## Advanced Features

### Sending Messages from Child to Parent
```javascript
pymChild.sendMessage('eventName', 'eventData');
```

### Listening to Messages in Parent
```javascript
pymParent.onMessage('eventName', function(message) {
  console.log('Received:', message);
});
```

### Manual Height Update
```javascript
pymChild.sendHeight();
```

## Benefits

1. **Automatic Height Adjustment**: No manual height calculations needed
2. **Responsive**: Works across all screen sizes
3. **Cross-Domain**: Works even when parent and child are on different domains
4. **Performance**: Efficient polling mechanism with configurable intervals
5. **Universal**: Works with all pages and components in your app

## Troubleshooting

### Height not updating
- Check that the child is initialized (check browser console)
- Verify polling is enabled (polling: 500)
- Ensure parent page has pym.js loaded

### CORS issues
- Make sure your server allows iframe embedding
- Check the X-Frame-Options header
- Verify Content-Security-Policy settings

### Performance
- Adjust polling interval if needed (increase for better performance, decrease for more responsive updates)
- Consider using manual sendHeight() for specific events instead of polling

## Resources

- [Pym.js Documentation](http://blog.apps.npr.org/pym.js/)
- [GitHub Repository](https://github.com/nprapps/pym.js)
