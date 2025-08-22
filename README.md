# Move.Text (Enhanced) 🚀

A powerful Figma plugin that intelligently copies text content between frames using advanced mapping algorithms, progress tracking, and an improved user experience.

## ✨ Features

### 🎯 **Intelligent Text Mapping**
- **Multi-strategy matching**: Uses 6 different strategies to find the best text node matches
- **Scoring system**: Advanced algorithm that prioritizes exact matches over approximate ones
- **Path-based matching**: Exact structural matching for identical frame layouts
- **Name-based matching**: Fallback to layer names when structure differs
- **Font-aware matching**: Considers font family, size, and text styles
- **Content similarity**: Partial text matching for better accuracy

### 🎨 **Enhanced User Interface**
- **Modern design**: Clean, professional interface with smooth animations
- **Progress tracking**: Real-time progress bars for long operations
- **Visual feedback**: Loading states, success indicators, and error messages
- **Statistics display**: Shows copied, pasted, and skipped text counts
- **Tooltips**: Helpful hints for each button and feature
- **Responsive layout**: Optimized for different screen sizes

### ⚡ **Performance Improvements**
- **Progress reporting**: Real-time updates during font loading and text mapping
- **Efficient algorithms**: Optimized text node traversal and matching
- **Memory management**: Better handling of large frames and complex structures
- **Error recovery**: Graceful handling of locked nodes and inaccessible elements

### 🔧 **Technical Enhancements**
- **TypeScript**: Full type safety and better development experience
- **Modular architecture**: Clean, maintainable code structure
- **Comprehensive logging**: Detailed console output for debugging
- **Error handling**: Robust error handling with user-friendly messages

## 🚀 Getting Started

### Installation
1. Clone this repository
2. Install dependencies: `npm install`
3. Build the plugin: `npm run build`
4. Load the plugin in Figma

### Usage
1. **Copy Text**: Select a source frame and click "Copy"
2. **Paste Text**: Select a target frame and click "Paste"
3. **Clear Data**: Click "Clear" to remove stored copy data

## 🏗️ Architecture

### Text Mapping Strategies (in order of priority)
1. **Path Matching** (Score: 1000) - Exact structural match
2. **Text Style Matching** (Score: 300) - Same text style ID
3. **Name Matching** (Score: 500) - Identical layer names
4. **Font Family Matching** (Score: 200) - Same font family
5. **Font Size Matching** (Score: 100) - Same font size
6. **Content Similarity** (Score: 10 per word) - Partial text overlap
7. **Position Similarity** (Score: 50 per level) - Similar path structure

### Data Flow
```
Frame Selection → Text Indexing → Font Loading → Mapping Algorithm → Text Application → Progress Reporting
```

## 📊 Performance Metrics

The plugin tracks and displays:
- **Copied**: Number of text nodes successfully copied
- **Pasted**: Number of text nodes successfully pasted
- **Skipped**: Number of text nodes that couldn't be processed
- **Progress**: Real-time progress during operations

## 🛠️ Development

### Scripts
- `npm run build` - Build the TypeScript code
- `npm run watch` - Watch mode for development
- `npm run dev` - Build and prepare for Figma
- `npm run clean` - Clean build artifacts

### Project Structure
```
copy-text-plugin/
├── code.ts          # Main plugin logic
├── ui.html          # User interface
├── manifest.json    # Plugin manifest
├── package.json     # Dependencies and metadata
├── tsconfig.json    # TypeScript configuration
└── README.md        # This file
```

## 🔄 Version History

### v1.1.0 (Current)
- ✨ Enhanced text mapping algorithms
- 🎨 Improved UI/UX with progress tracking
- 📊 Better statistics and feedback
- 🚀 Performance optimizations
- 🛠️ TypeScript improvements

### v1.0.0
- 🎯 Basic text copying between frames
- 🔍 Simple text node mapping
- 📱 Basic user interface

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Figma Plugin API team for the excellent platform
- Community contributors for feedback and suggestions
- Design system practitioners who inspired this tool

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Andrelimadesign/move.text/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Andrelimadesign/move.text/discussions)
- **Wiki**: [GitHub Wiki](https://github.com/Andrelimadesign/move.text/wiki)

---

**Made with ❤️ for the Figma design community**
