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

// Serializable version for storage
interface SerializableCopyPayload {
  sourceFrameId: string;
  sourceFrameName: string;
  capturedAt: number;
  items: SerializableTextItem[];
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

interface SerializableTextItem {
  path: number[];           // Child index path from frame root
  name?: string;            // Node name for fallback matching
  characters: string;       // Plain text content
  fontSize?: number;        // Font size for better matching
  fontFamily?: string;      // Font family name as string
  fontStyle?: string;       // Font style as string
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

// Function to check current selection and update UI feedback
function updateSelectionFeedback(): void {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 1 && selection[0].type === "FRAME") {
    const frame = selection[0] as FrameNode;
    figma.ui.postMessage({
      type: "FRAME_SELECTED",
      frameName: frame.name,
      canCopy: true
    });
  } else {
    figma.ui.postMessage({
      type: "NO_FRAME_SELECTED",
      canCopy: false
    });
  }
}

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
      const layerName = sourceItem.name || `Layer at path [${sourceItem.path.join(',')}]`;
      details.push(`⚠️ No suitable target found: ${layerName} - "${sourceItem.characters.substring(0, 30)}..."`);
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
      const layerName = sourceItem.name || `Layer at path [${sourceItem.path.join(',')}]`;
      details.push(`⚠️ All suitable targets already used: ${layerName} - "${sourceItem.characters.substring(0, 30)}..."`);
      skipped++;
      continue;
    }
    
    // Apply the mapping
    const targetNode = targetNodes[targetIndex];
    try {
      // Check if the node is locked or inaccessible
      if (targetNode.locked) {
        const layerName = sourceItem.name || `Layer at path [${sourceItem.path.join(',')}]`;
        details.push(`⚠️ Locked layer cannot be edited: ${layerName} (target: ${targetNode.name})`);
        skipped++;
        continue;
      }
      
      // Try to set the characters
      targetNode.characters = sourceItem.characters;
      usedIndices.add(targetIndex);
      mapped++;
      
             const scoreMatch = scores.find(s => s.targetIndex === targetIndex);
       const score = scoreMatch ? scoreMatch.score : 0;
      details.push(`✅ Mapped text (score: ${score}): "${sourceItem.characters.substring(0, 30)}..."`);
      
      // Report progress
      if (onProgress) {
        const percent = Math.round(((i + 1) / scoringMatrix.length) * 100);
        onProgress(percent);
      }
      
    } catch (error) {
      const layerName = sourceItem.name || `Layer at path [${sourceItem.path.join(',')}]`;
      details.push(`❌ Failed to update layer: ${layerName} - ${error}`);
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

// Helper function to find a node at a specific path in a frame
function findNodeAtPath(frame: FrameNode, path: number[]): SceneNode | null {
  if (path.length === 0) return frame;
  
  let currentNode: SceneNode = frame;
  
  for (const index of path) {
    if ("children" in currentNode && currentNode.children[index]) {
      currentNode = currentNode.children[index];
    } else {
      return null; // Path is invalid
    }
  }
  
  return currentNode;
}

// Helper function to find the parent frame of a node
function findParentFrame(node: SceneNode): FrameNode | null {
  let current = node.parent;
  
  while (current) {
    if (current.type === "FRAME") {
      return current as FrameNode;
    }
    current = current.parent;
  }
  
  return null;
}

// Helper functions for data serialization
function serializeTextItem(item: TextItem): SerializableTextItem {
  return {
    path: [...item.path],
    name: item.name,
    characters: item.characters,
    fontSize: item.fontSize,
    fontFamily: item.fontName?.family,
    fontStyle: item.fontName?.style,
    textStyleId: item.textStyleId
  };
}

function deserializeTextItem(item: SerializableTextItem): TextItem {
  return {
    path: [...item.path],
    name: item.name,
    characters: item.characters,
    fontSize: item.fontSize,
    fontName: item.fontFamily && item.fontStyle ? {
      family: item.fontFamily,
      style: item.fontStyle
    } : undefined,
    textStyleId: item.textStyleId
  };
}

function serializePayload(payload: CopyPayload): SerializableCopyPayload {
  return {
    sourceFrameId: payload.sourceFrameId,
    sourceFrameName: payload.sourceFrameName,
    capturedAt: payload.capturedAt,
    items: payload.items.map(serializeTextItem),
    frameStructure: payload.frameStructure
  };
}

function deserializePayload(serializedPayload: SerializableCopyPayload): CopyPayload {
  return {
    sourceFrameId: serializedPayload.sourceFrameId,
    sourceFrameName: serializedPayload.sourceFrameName,
    capturedAt: serializedPayload.capturedAt,
    items: serializedPayload.items.map(deserializeTextItem),
    frameStructure: serializedPayload.frameStructure
  };
}

// Enhanced message handlers with progress reporting
console.log("🚀 Enhanced plugin starting...");
figma.showUI(__html__, {width: 380, height: 380});

// Add selection change listener to detect frame selection
figma.on('selectionchange', () => {
  updateSelectionFeedback();
});

// Initial feedback update
updateSelectionFeedback();

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
      case "SELECT_SKIPPED_LAYER":
        console.log("🎯 Handling SELECT_SKIPPED_LAYER request...");
        await handleSelectSkippedLayer(msg.index, msg.layerName);
        break;
      case "FOCUS_VIEWPORT_ON_LAYER":
        console.log("🔍 Handling FOCUS_VIEWPORT_ON_LAYER request...");
        await handleFocusViewportOnLayer(msg.index, msg.layerName);
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
    
    try {
      const serializedPayload = serializePayload(payload);
      console.log("📋 Serialized payload for storage:", {
        itemCount: serializedPayload.items.length,
        hasFontData: serializedPayload.items.some(item => item.fontFamily),
        structure: serializedPayload.frameStructure
      });
      
      await figma.clientStorage.setAsync("copyPayload", serializedPayload);
      console.log("📋 Enhanced copy payload stored successfully");
    } catch (storageError) {
      console.error("❌ Failed to store payload:", storageError);
      // Continue with global variable only - user can still paste in this session
      console.log("⚠️ Continuing with global storage only");
    }
    
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
      try {
        const storedPayload = await figma.clientStorage.getAsync("copyPayload") as SerializableCopyPayload | null;
        if (storedPayload) {
          payload = deserializePayload(storedPayload);
        }
      } catch (storageError) {
        console.log("⚠️ Error reading from storage:", storageError);
        // Continue with null payload, will show appropriate error
      }
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

async function handleSelectSkippedLayer(index: number, layerName: string): Promise<void> {
  console.log("🎯 Starting layer selection for:", layerName, "at index:", index);
  
  try {
    if (!copyPayload) {
      throw new Error("No copy data available");
    }
    
    // Get the current page selection to find the target frame
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "FRAME") {
      throw new Error("Please select a target frame first");
    }
    
    const targetFrame = selection[0] as FrameNode;
    const sourceItem = copyPayload.items[index];
    
    if (!sourceItem) {
      throw new Error("Invalid layer index");
    }
    
    // Find the node at the specified path in the target frame
    const targetNode = findNodeAtPath(targetFrame, sourceItem.path);
    
    if (!targetNode) {
      throw new Error(`Layer not found at path: [${sourceItem.path.join(',')}]`);
    }
    
    // Select the node and focus the viewport
    figma.currentPage.selection = [targetNode];
    
    // Ensure the selection is visible by briefly selecting and deselecting
    setTimeout(() => {
      // Re-select to ensure the selection is properly highlighted
      figma.currentPage.selection = [targetNode];
    }, 100);
    
    // Enhanced viewport focusing with multiple strategies
    try {
      console.log("🎯 Starting enhanced viewport focusing...");
      
      // Notify UI that viewport focusing is starting
      figma.ui.postMessage({
        type: "VIEWPORT_FOCUSING"
      });
      
      // Log the node's position for debugging
      const nodeBounds = targetNode.absoluteBoundingBox;
      if (nodeBounds) {
        console.log("📍 Node bounds:", {
          x: nodeBounds.x,
          y: nodeBounds.y,
          width: nodeBounds.width,
          height: nodeBounds.height
        });
      }
      
      // Strategy 1: Direct viewport focusing
      console.log("🎯 Strategy 1: Direct viewport focus...");
      figma.viewport.scrollAndZoomIntoView([targetNode]);
      console.log("✅ Direct viewport focus completed");
      
      // Strategy 2: Check if node is visible and refocus if needed
      if (nodeBounds) {
        const centerX = nodeBounds.x + nodeBounds.width / 2;
        const centerY = nodeBounds.y + nodeBounds.height / 2;
        const viewportCenter = figma.viewport.center;
        
        console.log("🎯 Viewport center:", viewportCenter);
        console.log("🎯 Node center:", { x: centerX, y: centerY });
        
        // Calculate distance from viewport center
        const distanceX = Math.abs(centerX - viewportCenter.x);
        const distanceY = Math.abs(centerY - viewportCenter.y);
        const tolerance = 150; // Increased tolerance for better detection
        
        if (distanceX > tolerance || distanceY > tolerance) {
          console.log("🔄 Node is outside viewport tolerance, using enhanced focusing...");
          
          // Strategy 3: Enhanced focusing with parent frame context
          try {
            const parentFrame = findParentFrame(targetNode);
            if (parentFrame && parentFrame !== targetNode) {
              console.log("🔄 Strategy 3: Focusing on parent frame first...");
              figma.viewport.scrollAndZoomIntoView([parentFrame]);
              
              // Wait a bit, then focus on the specific node
              setTimeout(() => {
                try {
                  figma.viewport.scrollAndZoomIntoView([targetNode]);
                  console.log("✅ Enhanced focusing with parent frame completed");
                } catch (enhancedError) {
                  console.log("⚠️ Enhanced focusing failed:", enhancedError);
                }
              }, 300);
            }
          } catch (parentError) {
            console.log("⚠️ Parent frame focusing failed:", parentError);
          }
          
          // Strategy 4: Multiple rapid focus attempts
          console.log("🔄 Strategy 4: Multiple rapid focus attempts...");
          for (let i = 0; i < 3; i++) {
            try {
              figma.viewport.scrollAndZoomIntoView([targetNode]);
              console.log(`✅ Rapid focus attempt ${i + 1} completed`);
            } catch (rapidError) {
              console.log(`⚠️ Rapid focus attempt ${i + 1} failed:`, rapidError);
            }
          }
        } else {
          console.log("✅ Node is already within viewport tolerance");
        }
      }
      
      // Strategy 5: Final verification and adjustment
      setTimeout(() => {
        try {
          console.log("🔄 Strategy 5: Final verification and adjustment...");
          figma.viewport.scrollAndZoomIntoView([targetNode]);
          console.log("✅ Final viewport adjustment completed");
          
          // Notify UI that viewport focusing is complete
          figma.ui.postMessage({
            type: "VIEWPORT_SUCCESS"
          });
          
        } catch (finalError) {
          console.log("⚠️ Final viewport adjustment failed:", finalError);
        }
      }, 500);
      
    } catch (viewportError) {
      console.log("⚠️ Primary viewport focusing failed:", viewportError);
      
      // Emergency fallback: try to focus on parent frame
      try {
        console.log("🚨 Emergency fallback: focusing on parent frame...");
        const parentFrame = findParentFrame(targetNode);
        if (parentFrame && parentFrame !== targetNode) {
          figma.viewport.scrollAndZoomIntoView([parentFrame]);
          console.log("✅ Emergency fallback completed");
        }
      } catch (emergencyError) {
        console.log("🚨 Emergency fallback also failed:", emergencyError);
      }
    }
    
    // Show a notification to the user with more helpful information
    const layerType = targetNode.type.toLowerCase();
    figma.notify(`Selected ${layerType}: "${targetNode.name || layerName}" - Check the canvas for the highlighted layer`, {timeout: 3000});
    
    // Show success message
    figma.ui.postMessage({
      type: "SELECTION_SUCCESS",
      layerName: targetNode.name || layerName
    });
    
    console.log("✅ Layer selection completed successfully");
  } catch (error) {
    console.error("❌ Layer selection failed:", error);
    figma.ui.postMessage({
      type: "SELECTION_ERROR",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

async function handleFocusViewportOnLayer(index: number, layerName: string): Promise<void> {
  console.log("🔍 Starting viewport focus for:", layerName, "at index:", index);
  
  try {
    if (!copyPayload) {
      throw new Error("No copy data available");
    }
    
    // Get the current page selection to find the target frame
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || selection[0].type !== "FRAME") {
      throw new Error("Please select a target frame first");
    }
    
    const targetFrame = selection[0] as FrameNode;
    const sourceItem = copyPayload.items[index];
    
    if (!sourceItem) {
      throw new Error("Invalid layer index");
    }
    
    // Find the node at the specified path in the target frame
    const targetNode = findNodeAtPath(targetFrame, sourceItem.path);
    
    if (!targetNode) {
      throw new Error(`Layer not found at path: [${sourceItem.path.join(',')}]`);
    }
    
    // Focus viewport without changing selection
    try {
      console.log("🔍 Focusing viewport on layer without changing selection...");
      
      // Notify UI that viewport focusing is starting
      figma.ui.postMessage({
        type: "VIEWPORT_FOCUSING"
      });
      
      // Aggressive viewport focusing
      figma.viewport.scrollAndZoomIntoView([targetNode]);
      
      // Wait and try again for better results
      setTimeout(() => {
        try {
          figma.viewport.scrollAndZoomIntoView([targetNode]);
          console.log("✅ Secondary viewport focus completed");
        } catch (secondaryError) {
          console.log("⚠️ Secondary viewport focus failed:", secondaryError);
        }
      }, 200);
      
      // Final attempt
      setTimeout(() => {
        try {
          figma.viewport.scrollAndZoomIntoView([targetNode]);
          console.log("✅ Final viewport focus completed");
          
          // Notify UI that viewport focusing is complete
          figma.ui.postMessage({
            type: "VIEWPORT_SUCCESS"
          });
          
        } catch (finalError) {
          console.log("⚠️ Final viewport focus failed:", finalError);
        }
      }, 500);
      
    } catch (viewportError) {
      console.log("⚠️ Viewport focusing failed:", viewportError);
      
      // Try parent frame as fallback
      try {
        const parentFrame = findParentFrame(targetNode);
        if (parentFrame && parentFrame !== targetNode) {
          figma.viewport.scrollAndZoomIntoView([parentFrame]);
          console.log("✅ Fallback to parent frame completed");
        }
      } catch (fallbackError) {
        console.log("⚠️ Fallback to parent frame also failed:", fallbackError);
      }
    }
    
    // Show notification
    figma.notify(`Viewport focused on: ${targetNode.name || layerName}`, {timeout: 2000});
    
    console.log("✅ Viewport focusing completed successfully");
  } catch (error) {
    console.error("❌ Viewport focusing failed:", error);
    figma.ui.postMessage({
      type: "SELECTION_ERROR",
      message: error instanceof Error ? error.message : String(error)
    });
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
