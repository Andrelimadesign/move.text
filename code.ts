// Figma Plugin: Copy Text Between Frames
// Main plugin logic for copying and pasting text between frames

// Data structures for text copying
interface CopyPayload {
  sourceFrameId: string;
  sourceFrameName: string;
  capturedAt: number;
  items: TextItem[];
}

interface TextItem {
  path: number[];     // Child index path from frame root
  name?: string;      // Node name for fallback matching
  characters: string; // Plain text content
}

// Global storage for copy data
let copyPayload: CopyPayload | null = null;

// Font loading utility
async function ensureFontsLoaded(textNodes: TextNode[]): Promise<void> {
  console.log("🔤 Loading fonts for", textNodes.length, "text nodes...");
  
  const uniqueFonts = new Set<string>();
  textNodes.forEach(node => {
    if (node.fontName && typeof node.fontName === 'object') {
      uniqueFonts.add(JSON.stringify(node.fontName));
    }
  });
  
  console.log("🔤 Unique fonts found:", uniqueFonts.size);
  
  const fontPromises: Promise<void>[] = [];
  uniqueFonts.forEach(fontString => {
    try {
      const fontName = JSON.parse(fontString);
      fontPromises.push(figma.loadFontAsync(fontName));
    } catch (error) {
      console.log("⚠️ Could not parse font:", fontString);
    }
  });
  
  if (fontPromises.length > 0) {
    await Promise.all(fontPromises);
    console.log("✅ All fonts loaded successfully");
  } else {
    console.log("ℹ️ No fonts to load");
  }
}

// Selection validation
function validateSingleFrameSelection(): FrameNode {
  console.log("🔍 Validating selection...");
  const selection = figma.currentPage.selection;
  console.log("Selection length:", selection.length);
  
  if (selection.length !== 1) {
    throw new Error("Please select exactly one frame");
  }
  
  console.log("Selected item type:", selection[0].type);
  if (selection[0].type !== "FRAME") {
    throw new Error("Selected item must be a Frame");
  }
  
  console.log("✅ Selection validated successfully");
  return selection[0] as FrameNode;
}

// Text node indexing with DFS traversal
function indexTextNodes(frameNode: FrameNode): {
  items: TextItem[];
  nodes: TextNode[];
} {
  console.log("🔍 Indexing text nodes in frame:", frameNode.name);
  const items: TextItem[] = [];
  const nodes: TextNode[] = [];
  
  // Use iterative DFS to avoid recursion limits
  const stack: Array<{node: SceneNode, path: number[]}> = [
    {node: frameNode, path: []}
  ];
  
  while (stack.length > 0) {
    const {node, path} = stack.pop()!;
    
    if (node.type === "TEXT") {
      console.log("📝 Found text node:", node.name, "at path:", path);
      items.push({
        path: [...path],
        name: node.name,
        characters: node.characters
      });
      nodes.push(node);
    }
    
    if ("children" in node) {
      // Add children in reverse order for correct DFS traversal
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({
          node: node.children[i],
          path: [...path, i]
        });
      }
    }
  }
  
  console.log(`✅ Indexed ${items.length} text nodes`);
  return {items, nodes};
}

// Text mapping algorithm with fallback strategies
async function mapTextNodes(
  sourceItems: TextItem[],
  targetItems: TextItem[],
  targetNodes: TextNode[]
): Promise<{mapped: number; skipped: number}> {
  console.log("🔄 Mapping text nodes...");
  
  // Ensure fonts are loaded before attempting to modify text
  await ensureFontsLoaded(targetNodes);
  
  let mapped = 0;
  let skipped = 0;
  const usedIndices = new Set<number>();
  
  for (const sourceItem of sourceItems) {
    let targetIndex = -1;
    
    // Strategy 1: Path matching (exact structure)
    targetIndex = targetItems.findIndex((item, idx) =>
      !usedIndices.has(idx) &&
      item.path.length === sourceItem.path.length &&
      item.path.every((val, i) => val === sourceItem.path[i])
    );
    
    // Strategy 2: Name matching
    if (targetIndex === -1 && sourceItem.name) {
      targetIndex = targetItems.findIndex((item, idx) =>
        !usedIndices.has(idx) && item.name === sourceItem.name
      );
    }
    
    // Strategy 3: Order fallback (next available)
    if (targetIndex === -1) {
      targetIndex = targetItems.findIndex((_, idx) => !usedIndices.has(idx));
    }
    
    // Apply the mapping
    if (targetIndex !== -1) {
      const targetNode = targetNodes[targetIndex];
      try {
        // Check if the node is locked or inaccessible
        if (targetNode.locked) {
          console.log(`⚠️ Skipping locked text node: ${targetNode.name}`);
          skipped++;
          continue;
        }
        
        // Try to set the characters
        targetNode.characters = sourceItem.characters;
        usedIndices.add(targetIndex);
        mapped++;
        console.log(`✅ Mapped text: "${sourceItem.characters.substring(0, 30)}..."`);
      } catch (error) {
        console.log(`❌ Failed to map text:`, error);
        skipped++;
      }
    } else {
      console.log(`⚠️ No target found for text: "${sourceItem.characters.substring(0, 30)}..."`);
      skipped++;
    }
  }
  
  console.log(`✅ Mapping complete: ${mapped} mapped, ${skipped} skipped`);
  return {mapped, skipped};
}

// Message handlers
console.log("🚀 Plugin starting...");
figma.showUI(__html__, {width: 320, height: 200});

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
  console.log("📋 Starting copy operation...");
  
  try {
    const frame = validateSingleFrameSelection();
    console.log("📋 Frame selected:", frame.name);
    
    const {items} = indexTextNodes(frame);
    console.log("📋 Text items extracted:", items.length);
    
    const payload: CopyPayload = {
      sourceFrameId: frame.id,
      sourceFrameName: frame.name,
      capturedAt: Date.now(),
      items
    };
    
    // Store in global variable and client storage
    copyPayload = payload;
    await figma.clientStorage.setAsync("copyPayload", payload);
    console.log("📋 Copy payload stored successfully");
    
    figma.ui.postMessage({
      type: "COPY_SUCCESS",
      frameName: frame.name,
      textNodeCount: items.length
    });
    
    console.log("✅ Copy operation completed successfully");
  } catch (error) {
    console.error("❌ Copy operation failed:", error);
    throw error;
  }
}

async function handlePaste(): Promise<void> {
  console.log("📝 Starting paste operation...");
  
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
    
    const {mapped, skipped} = await mapTextNodes(payload.items, targetItems, targetNodes);
    
    figma.ui.postMessage({
      type: "PASTE_SUCCESS",
      mapped,
      skipped,
      total: payload.items.length
    });
    
    console.log("✅ Paste operation completed successfully");
  } catch (error) {
    console.error("❌ Paste operation failed:", error);
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

console.log("✅ Plugin initialization complete");
