import { GrafcetDiagram } from '../models/types';
import jsPDF from 'jspdf';
import Konva from 'konva';

export interface ExportOptions {
  hideGrid?: boolean;
  whiteBackground?: boolean;
  cropToContent?: boolean;
  pixelRatio?: number;
  exportSelectedOnly?: boolean;
}

// Internal helper to get export data URL with white background
const getExportDataUrlInternal = (stage: Konva.Stage, options: ExportOptions, rect?: { x: number, y: number, width: number, height: number }): string => {
  const pixelRatio = options.pixelRatio || 2;

  // Use toCanvas to get a canvas element
  const stageCanvas = stage.toCanvas({
    pixelRatio,
    x: rect?.x,
    y: rect?.y,
    width: rect?.width,
    height: rect?.height,
  });

  if (!options.whiteBackground) {
    return stageCanvas.toDataURL('image/png');
  }

  // Create a new canvas to add white background
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = stageCanvas.width;
  finalCanvas.height = stageCanvas.height;
  const ctx = finalCanvas.getContext('2d');

  if (ctx) {
    // Fill with white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    // Draw the stage canvas on top
    ctx.drawImage(stageCanvas, 0, 0);
  }

  return finalCanvas.toDataURL('image/png');
};

/**
 * Generates a high-quality PNG data URL for a diagram.
 * Useful for server-side generation or previews.
 */
export const getDiagramImage = async (stage: Konva.Stage, options: ExportOptions = {}): Promise<string> => {
  const mergedOptions = { hideGrid: true, whiteBackground: true, cropToContent: true, ...options };
  let dataURL = '';

  withExportFormatting(stage, mergedOptions, (rect) => {
    dataURL = getExportDataUrlInternal(stage, mergedOptions, rect);
  });

  return dataURL;
};

// Internal helper to temporarily format the stage for export
const withExportFormatting = (stage: Konva.Stage, options: ExportOptions, callback: (rect: { x: number, y: number, width: number, height: number } | undefined) => void | Promise<void>) => {
  const gridLayer = stage.findOne('.grid-layer');
  const wasVisible = gridLayer?.visible();

  if (options.hideGrid && gridLayer && wasVisible) {
    gridLayer.hide();
  }

  // Handle selected only export
  const hiddenNodes: Konva.Node[] = [];
  if (options.exportSelectedOnly) {
    stage.find('.element').forEach(node => {
      // Check if the node is "selected" based on Konva attributes or data
      const isSelected = (node as any).attrs.selected === true;
      if (!isSelected && node.visible()) {
        node.hide();
        hiddenNodes.push(node);
      }
    });

    stage.find('.connection').forEach(node => {
      const isSelected = (node as any).attrs.selected === true;
      if (!isSelected && node.visible()) {
        node.hide();
        hiddenNodes.push(node);
      }
    });
  }

  let exportRect: { x: number, y: number, width: number, height: number } | undefined;

  // Calculate content rect if needed
  if (options.cropToContent) {
    // Get client rect of all visible elements
    const layers = stage.getLayers();

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let foundVisible = false;

    layers.forEach(layer => {
      const children = layer.getChildren((node) => {
        // Only include visible non-grid elements
        return node.visible() && node.name() !== 'grid-layer';
      });

      children.forEach(child => {
        const box = child.getClientRect({ skipTransform: false });
        if (box.width > 0 && box.height > 0) {
          minX = Math.min(minX, box.x);
          minY = Math.min(minY, box.y);
          maxX = Math.max(maxX, box.x + box.width);
          maxY = Math.max(maxY, box.y + box.height);
          foundVisible = true;
        }
      });
    });

    if (foundVisible) {
      // Add padding (40px)
      const padding = 40;
      exportRect = {
        x: minX - padding,
        y: minY - padding,
        width: maxX - minX + 2 * padding,
        height: maxY - minY + 2 * padding
      };
    }
  }

  try {
    const result = callback(exportRect);
    if (result instanceof Promise) {
      // If async, we need to wait for it before restoring state
      // This is used by exportGsrsmToPdf
    }
  } finally {
    // Restore hidden nodes
    hiddenNodes.forEach(node => node.show());

    if (options.hideGrid && gridLayer && wasVisible) {
      gridLayer.show();
    }
  }
};

// Export diagram to PNG
export const exportToPng = (stageRef: React.RefObject<Konva.Stage>, diagram: GrafcetDiagram, options: ExportOptions = {}): void => {
  if (!stageRef.current) return;

  const stage = stageRef.current;
  const mergedOptions = { hideGrid: true, whiteBackground: true, cropToContent: true, pixelRatio: 2, ...options };

  withExportFormatting(stage, mergedOptions, (rect) => {
    const dataURL = getExportDataUrlInternal(stage, mergedOptions, rect);

    // Create download link
    const link = document.createElement('a');
    link.download = `${diagram.name}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
};

// Export diagram to PDF (SFC)
export const exportToPdf = (stageRef: React.RefObject<Konva.Stage>, diagram: GrafcetDiagram, options: ExportOptions = {}): void => {
  if (!stageRef.current) return;

  const stage = stageRef.current;
  // Use pixelRatio: 1 for PDF to avoid massive file sizes (A4 fitting handles the rest)
  const mergedOptions = { hideGrid: true, whiteBackground: true, cropToContent: true, pixelRatio: 1, ...options };

  withExportFormatting(stage, mergedOptions, (rect) => {
    const width = rect?.width || stage.width();
    const height = rect?.height || stage.height();

    const dataURL = getExportDataUrlInternal(stage, mergedOptions, rect);

    const orientation = width > height ? 'l' : 'p';
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imageWidth = pdfWidth - (2 * margin);
    const imageHeight = (height * imageWidth) / width;

    // Check if image height exceeds page height
    if (imageHeight > pdfHeight - 2 * margin) {
      // If it does, scale by height instead
      const scaledWidth = (width * (pdfHeight - 2 * margin)) / height;
      const centeredX = (pdfWidth - scaledWidth) / 2;
      pdf.addImage(dataURL, 'PNG', centeredX, margin, scaledWidth, pdfHeight - 2 * margin);
    } else {
      pdf.addImage(dataURL, 'PNG', margin, margin, imageWidth, imageHeight);
    }

    // Add simple title
    pdf.setFontSize(10);
    pdf.text(`${diagram.name}`, margin, pdfHeight - 5);

    pdf.save(`${diagram.name}.pdf`);
  });
};


// Export diagram to JSON
export const exportToJson = (diagram: GrafcetDiagram): void => {
  const jsonString = JSON.stringify(diagram, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Create download link
  const link = document.createElement('a');
  link.download = `${diagram.name}.grafcet.json`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);
};

// Export GSRSM diagram to PDF
export const exportGsrsmToPdf = async (stageRef: React.RefObject<Konva.Stage>, projectName: string, options: ExportOptions = {}): Promise<void> => {
  if (!stageRef.current) return;

  const stage = stageRef.current;
  const mergedOptions = { hideGrid: true, whiteBackground: true, cropToContent: true, ...options };

  await withExportFormatting(stage, mergedOptions, async (rect) => {
    try {
      // Get dimensions
      const width = rect?.width || stage.width();
      const height = rect?.height || stage.height();

      // Create a data URL of the stage using the canvas helper
      const dataURL = getExportDataUrlInternal(stage, mergedOptions, rect);

      // Create a new PDF document
      // Use landscape orientation if width > height
      const orientation = width > height ? 'l' : 'p';
      const pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: 'a4',
      });

      // Calculate PDF dimensions
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Calculate scaling to fit the image on the page with margins
      const margin = 10; // 10mm margin
      const imageWidth = pdfWidth - (2 * margin);
      const imageHeight = (height * imageWidth) / width;

      // Add title
      const title = `GSRSM Diagram - ${projectName}`;
      pdf.setFontSize(16);
      pdf.text(title, pdfWidth / 2, margin, { align: 'center' });

      // Add timestamp
      const timestamp = `Generated on: ${new Date().toLocaleString()}`;
      pdf.setFontSize(10);
      pdf.text(timestamp, pdfWidth / 2, margin + 7, { align: 'center' });

      // Add the image to the PDF
      pdf.addImage(
        dataURL,
        'PNG',
        margin,
        margin + 15, // Add space for the title
        imageWidth,
        imageHeight
      );

      // Add a note about active modes
      pdf.setFontSize(10);
      pdf.text('Note: Active modes are highlighted in green.', margin, pdfHeight - margin);

      // Save the PDF
      pdf.save(`${projectName}_GSRSM.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  });
};
