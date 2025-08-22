// Figma Plugin: Copy Text Between Frames
// Enhanced version with better mapping algorithms and progress reporting

// Enhanced data structures for text copying
interface CopyPayload {
  sourceFrameId: string;
  sourceFrameName: string;
  capturedAt: number;
  items: TextItem[];
  frameStructure: FrameStructure;
}

interface TextItem {
  path: number[];           // Child index path from frame root
  name?: string;            // Node name for fallback matching
  characters: string;       // Plain text content
  fontSize?: number;        // Font size for better matching
  fontName?: FontName;      // Font family for better matching
  textStyleId?: string;     // Text style ID if available
}

interface FrameStructure {
  nodeCount: number;
  textNodeCount: number;
  maxDepth: number;
  layerNames: string[];
}

// Global storage for copy data
let copyPayload: CopyPayload | null = null;

// Enhanced font loading utility with progress reporting
async function ensureFontsLoaded(textNodes: TextNode[], onProgress?: (percent: number) => void): Promise<void> {
  console.log("🔤 Loading fonts for", textNodes.length, "text nodes...");
  
  const uniqueFonts = new Set<string>();
  textNodes.forEach(node => {
    if (node.fontName && typeof node.fontName === 'object') {
      uniqueFonts.add(JSON.stringify(node.fontName));
    }
  });
  
  console.log("🔤 Unique fonts found:", uniqueFonts.size);
  
  if (uniqueFonts.size === 0) {
    console.log("ℹ️ No fonts to load");
    return;
  }
  
  const fontArray = Array.from(uniqueFonts);
  const fontPromises: Promise<void>[] = [];
  
  fontArray.forEach((fontString, index) => {
    try {
      const fontName = JSON.parse(fontString);
      const promise = figma.loadFontAsync(fontName).then(() => {
        if (onProgress) {
          const percent = Math.round(((index + 1) / fontArray.length) * 100);
          onProgress(percent);
        }
      });
      fontPromises.push(promise);
    } catch (error) {
      console.log("⚠️ Could not parse font:", fontString);
    }
  });
  
  if (fontPromises.length > 0) {
    await Promise.all(fontPromises);
    console.log("✅ All fonts loaded successfully");
  }
}

// Enhanced selection validation with better error messages
function validateSingleFrameSelection(): FrameNode {
  console.log("🔍 Validating selection...");
  const selection = figma.currentPage.selection;
  console.log("Selection length:", selection.length);
  
  if (selection.length === 0) {
    throw new Error("Please select a frame to work with");
  }
  
  if (selection.length > 1) {
    throw new Error("Please select only one frame at a time");
  }
  
  const selectedNode = selection[0];
  console.log("Selected item type:", selectedNode.type);
  
  if (selectedNode.type !== "FRAME") {
    throw new Error("Selected item must be a Frame. Please select a frame and try again.");
  }
  
  console.log("✅ Selection validated successfully");
  return selectedNode as FrameNode;
}

// Enhanced text node indexing with better structure analysis
function indexTextNodes(frameNode: FrameNode): {
  items: TextItem[];
  nodes: TextNode[];
  structure: FrameStructure;
} {
  console.log("🔍 Indexing text nodes in frame:", frameNode.name);
  const items: TextItem[] = [];
  const nodes: TextNode[] = [];
  const layerNames: string[] = [];
  let maxDepth = 0;
  let nodeCount = 0;
  
  // Use iterative DFS to avoid recursion limits
  const stack: Array<{node: SceneNode, path: number[], depth: number}> = [
    {node: frameNode, path: [], depth: 0}
  ];
  
  while (stack.length > 0) {
    const {node, path, depth} = stack.pop()!;
    nodeCount++;
    maxDepth = Math.max(maxDepth, depth);
    
    if (node.type === "TEXT") {
      console.log("📝 Found text node:", node.name, "at path:", path);
      
      // Extract additional properties for better matching
      const textItem: TextItem = {
        path: [...path],
        name: node.name,
        characters: node.characters,
        fontSize: node.fontSize as number,
        fontName: node.fontName as FontName,
        textStyleId: typeof node.textStyleId === 'string' ? node.textStyleId : undefined
      };
      
      items.push(textItem);
      nodes.push(node);
      layerNames.push(node.name);
    }
    
    if ("children" in node) {
      // Add children in reverse order for correct DFS traversal
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({
          node: node.children[i],
          path: [...path, i],
          depth: depth + 1
        });
      }
    }
  }
  
  const structure: FrameStructure = {
    nodeCount,
    textNodeCount: items.length,
    maxDepth,
    layerNames
  };
  
  console.log(`✅ Indexed ${items.length} text nodes out of ${nodeCount} total nodes`);
  console.log(`📊 Frame structure: max depth ${maxDepth}, layer names: ${layerNames.length}`);
  
  return {items, nodes, structure};
}

// Enhanced text mapping algorithm with multiple strategies and scoring
async function mapTextNodes(
  sourceItems: TextItem[],
  targetItems: TextItem[],
  targetNodes: TextNode[],
  onProgress?: (percent: number) => void
): Promise<{mapped: number; skipped: number; details: string[]}> {
  console.log("🔄 Mapping text nodes with enhanced algorithm...");
  
  // Ensure fonts are loaded before attempting to modify text
  await ensureFontsLoaded(targetNodes, onProgress);
  
  let mapped = 0;
  let skipped = 0;
  const usedIndices = new Set<number>();
  const details: string[] = [];
  
  // Create a scoring matrix for better matching
  const createScoringMatrix = () => {
    const matrix: Array<{sourceIndex: number, targetIndex: number, score: number}[]> = [];
    
    sourceItems.forEach((sourceItem, sourceIndex) => {
      const scores: Array<{sourceIndex: number, targetIndex: number, score: number}> = [];
      
      targetItems.forEach((targetItem, targetIndex) => {
        if (usedIndices.has(targetIndex)) return;
        
        let score = 0;
        
        // Strategy 1: Path matching (exact structure) - highest priority
        if (sourceItem.path.length === targetItem.path.length &&
            sourceItem.path.every((val, i) => val === targetItem.path[i])) {
          score += 1000;
        }
        
        // Strategy 2: Name matching (exact name)
        if (sourceItem.name && sourceItem.name === targetItem.name) {
          score += 500;
        }
        
        // Strategy 3: Font matching (same font family and size)
        if (sourceItem.fontName && targetItem.fontName &&
            sourceItem.fontSize && targetItem.fontSize) {
          if (sourceItem.fontName.family === targetItem.fontName.family) {
            score += 200;
            if (sourceItem.fontSize === targetItem.fontSize) {
              score += 100;
            }
          }
        }
        
        // Strategy 4: Text style matching
        if (sourceItem.textStyleId && sourceItem.textStyleId === targetItem.textStyleId) {
          score += 300;
        }
        
        // Strategy 5: Content similarity (partial text match)
        if (sourceItem.characters.length > 10 && targetItem.characters.length > 10) {
          const sourceWords = sourceItem.characters.toLowerCase().split(/\s+/);
          const targetWords = targetItem.characters.toLowerCase().split(/\s+/);
          const commonWords = sourceWords.filter(word => targetWords.includes(word));
          score += commonWords.length * 10;
        }
        
        // Strategy 6: Position-based scoring (closer positions get higher scores)
        const pathSimilarity = calculatePathSimilarity(sourceItem.path, targetItem.path);
        score += pathSimilarity * 50;
        
        if (score > 0) {
          scores.push({sourceIndex, targetIndex, score});
        }
      });
      
      // Sort by score (highest first)
      scores.sort((a, b) => b.score - a.score);
      matrix.push(scores);
    });
    
    return matrix;
  };
  
  const scoringMatrix = createScoringMatrix();
  
  // Process mappings based on scores
  for (let i = 0; i < scoringMatrix.length; i++) {
    const scores = scoringMatrix[i];
    const sourceItem = sourceItems[i];
    
    if (scores.length === 0) {
      details.push(`⚠️ No suitable target found for: "${sourceItem.characters.substring(0, 30)}..."`);
      skipped++;
      continue;
    }
    
    // Find the best available target
    let targetIndex = -1;
    for (const score of scores) {
      if (!usedIndices.has(score.targetIndex)) {
        targetIndex = score.targetIndex;
        break;
      }
    }
    
    if (targetIndex === -1) {
      details.push(`⚠️ All suitable targets already used for: "${sourceItem.characters.substring(0, 30)}..."`);
      skipped++;
      continue;
    }
    
    // Apply the mapping
    const targetNode = targetNodes[targetIndex];
    try {
      // Check if the node is locked or inaccessible
      if (targetNode.locked) {
        details.push(`⚠️ Skipping locked text node: ${targetNode.name}`);
        skipped++;
        continue;
      }
      
      // Try to set the characters
      targetNode.characters = sourceItem.characters;
      usedIndices.add(targetIndex);
      mapped++;
      
      const score = scores.find(s => s.targetIndex === targetIndex)?.score || 0;
      details.push(`✅ Mapped text (score: ${score}): "${sourceItem.characters.substring(0, 30)}..."`);
      
      // Report progress
      if (onProgress) {
        const percent = Math.round(((i + 1) / scoringMatrix.length) * 100);
        onProgress(percent);
      }
      
    } catch (error) {
      details.push(`❌ Failed to map text: ${error}`);
      skipped++;
    }
  }
  
  console.log(`✅ Mapping complete: ${mapped} mapped, ${skipped} skipped`);
  return {mapped, skipped, details};
}

// Helper function to calculate path similarity
function calculatePathSimilarity(path1: number[], path2: number[]): number {
  if (path1.length === 0 || path2.length === 0) return 0;
  
  const minLength = Math.min(path1.length, path2.length);
  let similarity = 0;
  
  for (let i = 0; i < minLength; i++) {
    if (path1[i] === path2[i]) {
      similarity += 1;
    } else {
      break; // Stop at first mismatch
    }
  }
  
  return similarity / Math.max(path1.length, path2.length);
}

// Enhanced message handlers with progress reporting
console.log("🚀 Enhanced plugin starting...");
figma.showUI(__html__, {width: 380, height: 280});

figma.ui.onmessage = async (msg) => {
  console.log("📨 Received message:", msg);
  
  try {
    switch (msg.type) {
      case "COPY":
        console.log("📋 Handling COPY request...");
        await handleCopy();
        break;
      case "PASTE":
        console.log("📝 Handling PASTE request...");
        await handlePaste();
        break;
      case "CLEAR":
        console.log("🗑️ Handling CLEAR request...");
        await handleClear();
        break;
      default:
        console.log("⚠️ Unknown message type:", msg.type);
    }
  } catch (error) {
    console.error("❌ Error handling message:", error);
    figma.ui.postMessage({
      type: "ERROR",
      message: error instanceof Error ? error.message : String(error)
    });
  }
};

async function handleCopy(): Promise<void> {
  console.log("📋 Starting enhanced copy operation...");
  
  try {
    const frame = validateSingleFrameSelection();
    console.log("📋 Frame selected:", frame.name);
    
    const {items, structure} = indexTextNodes(frame);
    console.log("📋 Text items extracted:", items.length);
    
    const payload: CopyPayload = {
      sourceFrameId: frame.id,
      sourceFrameName: frame.name,
      capturedAt: Date.now(),
      items,
      frameStructure: structure
    };
    
    // Store in global variable and client storage
    copyPayload = payload;
    await figma.clientStorage.setAsync("copyPayload", payload);
    console.log("📋 Enhanced copy payload stored successfully");
    
    figma.ui.postMessage({
      type: "COPY_SUCCESS",
      frameName: frame.name,
      textNodeCount: items.length,
      structure: structure
    });
    
    console.log("✅ Enhanced copy operation completed successfully");
  } catch (error) {
    console.error("❌ Enhanced copy operation failed:", error);
    throw error;
  }
}

async function handlePaste(): Promise<void> {
  console.log("📝 Starting enhanced paste operation...");
  
  try {
    const frame = validateSingleFrameSelection();
    console.log("📝 Target frame selected:", frame.name);
    
    // Try to get from global variable first, then from storage
    let payload = copyPayload;
    if (!payload) {
      console.log("📝 No global payload, checking storage...");
      payload = await figma.clientStorage.getAsync("copyPayload") as CopyPayload | null;
    }
    
    if (!payload) {
      throw new Error("No text copied. Please copy text from a frame first.");
    }
    
    console.log("📝 Found payload with", payload.items.length, "text items");
    
    const {items: targetItems, nodes: targetNodes} = indexTextNodes(frame);
    console.log("📝 Target frame has", targetItems.length, "text nodes");
    
    // Report progress during mapping
    const {mapped, skipped, details} = await mapTextNodes(
      payload.items, 
      targetItems, 
      targetNodes,
      (percent) => {
        figma.ui.postMessage({
          type: "PROGRESS",
          percent
        });
      }
    );
    
    figma.ui.postMessage({
      type: "PASTE_SUCCESS",
      mapped,
      skipped,
      total: payload.items.length,
      details
    });
    
    console.log("✅ Enhanced paste operation completed successfully");
  } catch (error) {
    console.error("❌ Enhanced paste operation failed:", error);
    throw error;
  }
}

async function handleClear(): Promise<void> {
  console.log("🗑️ Starting clear operation...");
  
  try {
    copyPayload = null;
    await figma.clientStorage.setAsync("copyPayload", null);
    console.log("🗑️ Copy data cleared successfully");
    
    figma.ui.postMessage({type: "CLEAR_SUCCESS"});
    
    console.log("✅ Clear operation completed successfully");
  } catch (error) {
    console.error("❌ Clear operation failed:", error);
    throw error;
  }
}

console.log("✅ Enhanced plugin initialization complete");
