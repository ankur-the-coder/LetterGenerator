import { CommonModule } from '@angular/common';
import { Component, ViewChild, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

interface CanvasElement {
  id: string;
  type: 'signature' | 'letterBody' | 'text' | 'templateBg';
  x: number;
  y: number;
  width: number;
  height: number;
  imageData?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  color?: string;
  isDragging?: boolean;
  isResizing?: boolean;
  isTemplateText?: boolean;
  pageNumber?: number; // ADD THIS LINE
  
  richTextSegments?: Array<{
    text: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
  }>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title(title: any) {
    throw new Error('Method not implemented.');
  }
  @ViewChild('canvas', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper', { static: false }) canvasWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('fileInputTemplate', { static: false }) fileInputTemplate!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputSignature', { static: false }) fileInputSignature!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputLetter', { static: false }) fileInputLetter!: ElementRef<HTMLInputElement>;

  private isTyping = false;
  private textBox: { x: number; y: number; width: number; height: number; text: string } | null = null;
  private ctx!: CanvasRenderingContext2D;
  private canvasElements: CanvasElement[] = [];
  private selectedElement: CanvasElement | null = null;
  private dragOffset = { x: 0, y: 0 };
  private templateImage: HTMLImageElement | null = null;
  private isDraggingTextBox = false;
  private textBoxDragOffset = { x: 0, y: 0 };
  // Add these properties at the top with other properties
 private cursorPosition = 0; // Track cursor position in text
 private cursorBlinkVisible = true;
 private selectionStart = 0;
private selectionEnd = 0;
private isMouseSelecting = false;
// Add these properties with other component properties
showEditModal = false;
editingText = '';
editingElement: CanvasElement | null = null;
// Add these after other properties
showTextBodyModal = false;
textBodyContent = '';
modalFontFamily = 'Arial';
modalFontSize = 16;
modalFontWeight = 'normal';
modalFontStyle = 'normal';
modalTextDecoration = 'none';
modalTextColor = '#000000';
currentPage = 1;
  
  // High resolution canvas (300 DPI)
  canvasWidth = 2480; // A4 width at 300 DPI (210mm)
  canvasHeight = 3508; // A4 height at 300 DPI (297mm)
  displayWidth = 794; // Display width at 96 DPI
  displayHeight = 1123; // Display height at 96 DPI
  scale = 1; // Scale factor for fitting canvas to screen
  zoom = 1;
  
  // Background removal settings
  threshold = 30;
  smoothing = 2;
  autoDetect = true;
  
  // Text tool settings
  isTextMode = false;
  textCursor = { x: 0, y: 0, visible: false };
  currentText = '';
  fontSize = 16;
  fontFamily = 'Arial';
  fontWeight = 'normal';
  fontStyle = 'normal';
  textDecoration = 'none';
  textColor = '#000000';

  // Template options
templates = [
  { name: 'Standard Business Letter', value: 'standard' },
  { name: 'Formal Cover Letter', value: 'cover' },
  { name: 'Casual Inquiry', value: 'casual' },
  { name: 'Professional Thank You', value: 'thankyou' }
];
selectedTemplate = 'standard'; // Default template
  
  // UI state
  processing = false;
  statusMessage = '';
  statusType = '';
  
  // Font options
  fontFamilies = ['Arial', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana', 'Helvetica', 'Tahoma'];
  fontSizes = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

  constructor() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.4.394/build/pdf.worker.mjs';
;
  }

ngOnInit(): void {
  setInterval(() => {
    if (this.isTyping && this.textBox) {
      this.cursorBlinkVisible = !this.cursorBlinkVisible;
      this.drawCanvas();
    }
  }, 500);
}

  ngAfterViewInit(): void {
    this.initCanvas();
    setTimeout(() => this.fitCanvasToScreen(), 100);
  }

  initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;
    this.drawCanvas();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.fitCanvasToScreen();
  }

  fitCanvasToScreen(): void {
    if (!this.canvasWrapperRef) return;
    
    const wrapper = this.canvasWrapperRef.nativeElement;
    const wrapperWidth = wrapper.clientWidth - 40; // padding
    const wrapperHeight = wrapper.clientHeight - 40;
    
    const scaleX = wrapperWidth / this.displayWidth;
    const scaleY = wrapperHeight / this.displayHeight;
    this.scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
    
    this.applyScale();
  }

  private applyScale(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.style.width = `${this.displayWidth * this.scale * this.zoom}px`;
    canvas.style.height = `${this.displayHeight * this.scale * this.zoom}px`;
  }

  onTemplateClick(): void {
    this.fileInputTemplate.nativeElement.value = '';  // Clear the input
    this.fileInputTemplate.nativeElement.click();
  }
  
  onSignatureClick(): void {
    this.fileInputSignature.nativeElement.value = '';  // Clear the input
    this.fileInputSignature.nativeElement.click();
  }
  
  onLetterBodyClick(): void {
    this.fileInputLetter.nativeElement.value = '';  // Clear the input
    this.fileInputLetter.nativeElement.click();
  }

  async onTemplateChange(event: any): Promise<void> {
    const file = event.target.files[0];
    if (file) {
      await this.handleTemplateFile(file);
    }
  }

  async onSignatureChange(event: any): Promise<void> {
    const file = event.target.files[0];
    if (file) {
      await this.handleElementFile(file, 'signature');
    }
  }

  async onLetterBodyChange(event: any): Promise<void> {
    const file = event.target.files[0];
    if (file) {
      // Check if it's a Word document
      if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        await this.handleWordDocument(file);
      } else {
        await this.handleElementFile(file, 'letterBody');
      }
    }
  }
  
  private async handleWordDocument(file: File): Promise<void> {
    this.showStatus('Loading Word document...', 'processing');
    try {
      const { text, segments } = await this.handleWordFile(file);
      
      const scaleFactor = this.canvasWidth / this.displayWidth;
      
      // Better height calculation
      const lineCount = (text.match(/\n/g) || []).length + 1;
      const estimatedHeight = Math.max(
        lineCount * 20 * scaleFactor,
        this.canvasHeight * 0.7
      );
      
      const element: CanvasElement = {
        id: `text_${Date.now()}`,
        type: 'text',
        x: 120 * scaleFactor,
        y: 150 * scaleFactor,
        width: this.canvasWidth - 240 * scaleFactor,  // More width
        height: Math.min(estimatedHeight, this.canvasHeight - 200 * scaleFactor),
        text: text,
        fontSize: 13,  // Slightly smaller for better fit
        fontFamily: 'Arial',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        color: '#000000',
        richTextSegments: segments
      };
      
      this.canvasElements.push(element);
      this.drawCanvas();
      this.showStatus('Word document imported!', 'success');
    } catch (error) {
      this.showStatus('Failed to import Word document', 'error');
      console.error(error);
    }
  }

  private async handleTemplateFile(file: File): Promise<void> {
    this.showStatus('Loading template...', 'processing');
    try {
      const imageData = await this.fileToImageData(file);
      const img = await this.loadImage(imageData);
      this.templateImage = img;
      this.drawCanvas();
      this.showStatus('Template loaded!', 'success');
    } catch (error) {
      this.showStatus('Failed to load template', 'error');
      console.error(error);
    }
  }

private async handleElementFile(file: File, type: 'signature' | 'letterBody'): Promise<void> {
  this.showStatus(`Loading ${type}...`, 'processing');
  try {
    let imageData = await this.fileToImageData(file);
    imageData = await this.removeBackground(imageData);
    
    // Crop transparent areas
    imageData = await this.cropTransparentAreas(imageData);
    
    const img = await this.loadImage(imageData);
    const scaleFactor = this.canvasWidth / this.displayWidth;
    
    // Scale signature to reasonable size (max 300px wide at display resolution)
    let width = img.width;
    let height = img.height;
    
if (type === 'signature') {
  const maxSignatureWidth = 200 * scaleFactor; // Made smaller (was 300)
  if (width > maxSignatureWidth) {
    const ratio = maxSignatureWidth / width;
    width = maxSignatureWidth;
    height = height * ratio;
  }
}

// Scale letter body to fill canvas
if (type === 'letterBody') {
  const targetWidth = this.canvasWidth - 150 * scaleFactor; // Leave margins
  const targetHeight = this.canvasHeight - 300 * scaleFactor; // Leave top/bottom margins
  const widthRatio = targetWidth / width;
  const heightRatio = targetHeight / height;
  const scale = Math.min(widthRatio, heightRatio);
  
  width = width * scale;
  height = height * scale;
}

const element: CanvasElement = {
  id: `${type}_${Date.now()}`,
  type,
  x: type === 'signature' ? (this.canvasWidth - width - 50 * scaleFactor) : 
     type === 'letterBody' ? (100 * scaleFactor) : (100 * scaleFactor),
  y: type === 'signature' ? (this.canvasHeight - height - 100 * scaleFactor) : 
     type === 'letterBody' ? (250 * scaleFactor) : (300 * scaleFactor),
  width: width,
  height: height,
  imageData
};
    
    this.canvasElements.push(element);
    this.drawCanvas();
    this.showStatus(`${type} loaded!`, 'success');
  } catch (error) {
    this.showStatus(`Failed to load ${type}`, 'error');
    console.error(error);
  }
}

private async cropTransparentAreas(imageDataURL: string): Promise<string> {
  const img = await this.loadImage(imageDataURL);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  
  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  
  const croppedCanvas = document.createElement('canvas');
  const croppedCtx = croppedCanvas.getContext('2d')!;
  croppedCanvas.width = croppedWidth;
  croppedCanvas.height = croppedHeight;
  
  croppedCtx.drawImage(canvas, minX, minY, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
  
  return croppedCanvas.toDataURL('image/png');
}


  private async fileToImageData(file: File): Promise<string> {
    if (file.type === 'application/pdf') {
      return await this.pdfToImage(file);
    } else {
      return await this.readFileAsDataURL(file);
    }
  }

  private async pdfToImage(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    const scale = 3; // Higher resolution
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;  // ✅ Create new context
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context, 
      viewport: viewport,
      canvas: canvas  
    }).promise;
    
    return canvas.toDataURL('image/png');
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private async removeBackground(imageDataURL: string): Promise<string> {
    const img = await this.loadImage(imageDataURL);
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = img.width;
    canvas.height = img.height;
    
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let bgColor;
    if (this.autoDetect) {
      bgColor = this.detectBackgroundColor(data, canvas.width, canvas.height);
    } else {
      bgColor = { r: data[0], g: data[1], b: data[2] };
    }
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      const diff = Math.sqrt(
        Math.pow(r - bgColor.r, 2) +
        Math.pow(g - bgColor.g, 2) +
        Math.pow(b - bgColor.b, 2)
      );
      
      if (diff < this.threshold) {
        data[i + 3] = 0;
      }
    }
    
    if (this.smoothing > 0) {
      this.applyEdgeSmoothing(data, canvas.width, canvas.height, this.smoothing);
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  private detectBackgroundColor(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number } {
    const corners = [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: 0, y: height - 1 },
      { x: width - 1, y: height - 1 }
    ];
    
    let totalR = 0, totalG = 0, totalB = 0;
    let samples = 0;
    
    corners.forEach(corner => {
      for (let dx = 0; dx < 10 && corner.x + dx < width; dx++) {
        for (let dy = 0; dy < 10 && corner.y + dy < height; dy++) {
          const idx = ((corner.y + dy) * width + (corner.x + dx)) * 4;
          totalR += data[idx];
          totalG += data[idx + 1];
          totalB += data[idx + 2];
          samples++;
        }
      }
    });
    
    return {
      r: Math.round(totalR / samples),
      g: Math.round(totalG / samples),
      b: Math.round(totalB / samples)
    };
  }

  private applyEdgeSmoothing(data: Uint8ClampedArray, width: number, height: number, radius: number): void {
    const tempData = new Uint8ClampedArray(data);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        
        if (data[idx + 3] > 0 && data[idx + 3] < 255) {
          let sumAlpha = 0;
          let count = 0;
          
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nidx = (ny * width + nx) * 4;
                sumAlpha += data[nidx + 3];
                count++;
              }
            }
          }
          
          tempData[idx + 3] = Math.round(sumAlpha / count);
        }
      }
    }
    
    data.set(tempData);
  }

  drawCanvas(): void {
    if (!this.ctx) return;
    
    const canvas = this.canvasRef.nativeElement;
    
    // Clear canvas
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw template background on every page
    if (this.templateImage) {
      this.ctx.drawImage(this.templateImage, 0, 0, canvas.width, canvas.height);
    }
    
    // Draw text box first (if exists)
    if (this.textBox) {
      // [Keep all existing textBox code - don't change]
      this.ctx.save();
      
      const scaleRatio = this.canvasWidth / this.displayWidth;
      const fontSize = this.fontSize * scaleRatio;
      
      this.ctx.font = `${this.fontStyle} ${this.fontWeight} ${fontSize}px ${this.fontFamily}`;
      this.ctx.fillStyle = this.textColor;
      this.ctx.textBaseline = 'top';
      this.ctx.textAlign = 'left';
      
      const padding = 20 * scaleRatio;
      const maxWidth = this.textBox.width - 40 * scaleRatio;
      const lineHeight = fontSize * 1.4;
      
      const lines: {text: string, charStart: number, charEnd: number}[] = [];
      let charCount = 0;
      
      const paragraphs = this.textBox.text.split('\n');
      paragraphs.forEach((paragraph, pIndex) => {
        if (paragraph.trim() === '') {
          lines.push({text: '', charStart: charCount, charEnd: charCount});
          charCount += 1;
          return;
        }
        
        const words = paragraph.split(' ');
        let currentLine = '';
        let lineStartChar = charCount;
        
        words.forEach((word) => {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const metrics = this.ctx.measureText(testLine);
          
          if (metrics.width > maxWidth && currentLine !== '') {
            const lineEndChar = charCount + currentLine.length;
            lines.push({text: currentLine, charStart: lineStartChar, charEnd: lineEndChar});
            charCount += currentLine.length + 1;
            currentLine = word;
            lineStartChar = charCount;
          } else {
            currentLine = testLine;
          }
        });
        
        if (currentLine) {
          const lineEndChar = charCount + currentLine.length;
          lines.push({text: currentLine, charStart: lineStartChar, charEnd: lineEndChar});
          charCount += currentLine.length;
        }
        
        if (pIndex < paragraphs.length - 1) {
          charCount += 1;
        }
      });
      
      if (this.selectionEnd > this.selectionStart) {
        this.ctx.fillStyle = 'rgba(79, 70, 229, 0.3)';
        
        lines.forEach((line, i) => {
          const lineY = this.textBox!.y + padding + i * lineHeight;
          
          if (this.selectionStart < line.charEnd && this.selectionEnd > line.charStart) {
            const selectStart = Math.max(this.selectionStart, line.charStart);
            const selectEnd = Math.min(this.selectionEnd, line.charEnd);
            
            const textBeforeSelection = line.text.substring(0, selectStart - line.charStart);
            const selectedText = line.text.substring(selectStart - line.charStart, selectEnd - line.charStart);
            
            const startX = this.textBox!.x + padding + this.ctx.measureText(textBeforeSelection).width;
            const selectionWidth = this.ctx.measureText(selectedText).width;
            
            this.ctx.fillRect(startX, lineY, selectionWidth, fontSize);
          }
        });
      }
      
      this.ctx.fillStyle = this.textColor;
      lines.forEach((line, i) => {
        this.ctx.fillText(line.text, this.textBox!.x + padding, this.textBox!.y + padding + i * lineHeight);
      });
      
      if (this.cursorBlinkVisible && this.selectionStart === this.selectionEnd) {
        let cursorX = this.textBox.x + padding;
        let cursorY = this.textBox.y + padding;
        let charsProcessed = 0;
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineLength = line.text.length;
          
          if (charsProcessed + lineLength >= this.cursorPosition) {
            const posInLine = this.cursorPosition - charsProcessed;
            const textBeforeCursorInLine = line.text.substring(0, posInLine);
            cursorX = this.textBox.x + padding + this.ctx.measureText(textBeforeCursorInLine).width;
            cursorY = this.textBox.y + padding + i * lineHeight;
            break;
          }
          
          charsProcessed += lineLength + 1;
        }
        
        this.ctx.fillStyle = '#4F46E5';
        this.ctx.fillRect(cursorX, cursorY, 2, fontSize);
      }
      
      this.ctx.strokeStyle = '#4F46E5';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeRect(this.textBox.x, this.textBox.y, this.textBox.width, this.textBox.height);
      this.ctx.setLineDash([]);
      
      this.ctx.restore();
    }
    
    // Track if we have a text body element on current page for selection
    let textBodyOnCurrentPage: CanvasElement | null = null;
    
    // Draw canvas elements (ONLY for current page)
    this.canvasElements.forEach(element => {
      // Skip elements not on current page
      if (element.pageNumber && element.pageNumber !== this.currentPage) {
        return;
      }
      
      // Track text body element on current page
      if (element.id.startsWith('textBody_') && element.pageNumber === this.currentPage) {
        textBodyOnCurrentPage = element;
      }
      
      if (element.imageData) {
        const img = new Image();
        img.onload = () => {
          this.ctx.save();
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';
          this.ctx.drawImage(img, element.x, element.y, element.width, element.height);
          
          if (this.selectedElement?.id === element.id && !this.isExporting) {
            this.drawElementControls(element);
          }
          
          this.ctx.restore();
        };
        img.src = element.imageData;
      } 
      else if (element.text) {
        this.ctx.save();
        const scaleRatio = this.canvasWidth / this.displayWidth;
        const fontSize = element.fontSize! * scaleRatio;
        this.ctx.textBaseline = 'top';
        this.ctx.textAlign = 'left';
      
        const padding = 20 * scaleRatio;
        const maxWidth = element.width - 40 * scaleRatio;
        const lineHeight = fontSize * 1.4;
        
        if (element.richTextSegments && element.richTextSegments.length > 0) {
          let currentY = element.y + padding;
          let currentX = element.x + padding;
          
          element.richTextSegments.forEach(segment => {
            const weight = segment.bold ? 'bold' : (element.fontWeight || 'normal');
            const style = segment.italic ? 'italic' : (element.fontStyle || 'normal');
            
            this.ctx.font = `${style} ${weight} ${fontSize}px ${element.fontFamily}`;
            this.ctx.fillStyle = element.color || '#000000';
            
            if (segment.text === '\n') {
              currentY += lineHeight;
              currentX = element.x + padding;
            } else {
              const words = segment.text.split(' ');
              
              words.forEach((word, idx) => {
                if (!word.trim()) return;
                
                const wordText = word;
                const spaceWidth = this.ctx.measureText(' ').width;
                const wordWidth = this.ctx.measureText(wordText).width;
                
                if (currentX + wordWidth > element.x + element.width - padding && currentX > element.x + padding) {
                  currentY += lineHeight;
                  currentX = element.x + padding;
                }
                
                this.ctx.fillText(wordText, currentX, currentY);
                currentX += wordWidth;
                
                if (idx < words.length - 1) {
                  currentX += spaceWidth;
                }
              });
            }
          });
        } else {
          this.ctx.font = `${element.fontStyle} ${element.fontWeight} ${fontSize}px ${element.fontFamily}`;
          this.ctx.fillStyle = element.color || '#000000';
          
          const paragraphs = element.text.split('\n');
          const allLines: string[] = [];
      
          paragraphs.forEach(paragraph => {
            if (paragraph.trim() === '') {
              allLines.push('');
              return;
            }
      
            const words = paragraph.split(' ');
            let currentLine = '';
      
            words.forEach(word => {
              const testLine = currentLine ? currentLine + ' ' + word : word;
              const metrics = this.ctx.measureText(testLine);
              if (metrics.width > maxWidth && currentLine !== '') {
                allLines.push(currentLine);
                currentLine = word;
              } else {
                currentLine = testLine;
              }
            });
            if (currentLine) allLines.push(currentLine);
          });
      
          allLines.forEach((line, i) => {
            this.ctx.fillText(line, element.x + padding, element.y + padding + i * lineHeight);
          });
        }
      
        // ALWAYS show controls for text body on current page if not exporting
        if (!this.isExporting && element.id.startsWith('textBody_')) {
          this.drawElementControls(element);
        } else if (this.selectedElement?.id === element.id && !this.isExporting) {
          this.drawElementControls(element);
        }
      
        this.ctx.restore();
      }
    });
  }

// Add this method to your component class
private moveTextBox(x: number, y: number): void {
  if (this.textBox) {
    this.textBox.x = x;
    this.textBox.y = y;
    this.drawCanvas();
  }
}

private isExporting = false;

private drawElementControls(element: CanvasElement): void {
  const buttonSize = 24; // FIXED SIZE in canvas pixels (not scaled)
  
  // Selection border
  this.ctx.strokeStyle = '#4F46E5';
  this.ctx.lineWidth = 3;
  this.ctx.strokeRect(element.x - 2, element.y - 2, element.width + 4, element.height + 4);
  
  // Delete button (top-right, red) - LARGER HIT AREA
  this.ctx.fillStyle = '#EF4444';
  this.ctx.beginPath();
  this.ctx.arc(element.x + element.width + 12, element.y - 12, buttonSize, 0, Math.PI * 2);
  this.ctx.fill();
  
  // X mark - clearer
  this.ctx.strokeStyle = 'white';
  this.ctx.lineWidth = 4;
  this.ctx.beginPath();
  this.ctx.moveTo(element.x + element.width + 2, element.y - 22);
  this.ctx.lineTo(element.x + element.width + 22, element.y - 2);
  this.ctx.moveTo(element.x + element.width + 22, element.y - 22);
  this.ctx.lineTo(element.x + element.width + 2, element.y - 2);
  this.ctx.stroke();
  
  // Drag button (top-left, blue) - LARGER
  this.ctx.fillStyle = '#3B82F6';
  this.ctx.beginPath();
  this.ctx.arc(element.x - 12, element.y - 12, buttonSize, 0, Math.PI * 2);
  this.ctx.fill();
  
  // Move icon - clearer
  this.ctx.strokeStyle = 'white';
  this.ctx.lineWidth = 4;
  this.ctx.beginPath();
  this.ctx.moveTo(element.x - 12, element.y - 24);
  this.ctx.lineTo(element.x - 12, element.y);
  this.ctx.moveTo(element.x - 24, element.y - 12);
  this.ctx.lineTo(element.x, element.y - 12);
  this.ctx.stroke();
  
  // Resize button (bottom-right, green) - LARGER
  this.ctx.fillStyle = '#10B981';
  this.ctx.beginPath();
  this.ctx.arc(element.x + element.width + 12, element.y + element.height + 12, buttonSize, 0, Math.PI * 2);
  this.ctx.fill();
  
  // Resize icon - clearer
  this.ctx.strokeStyle = 'white';
  this.ctx.lineWidth = 4;
  this.ctx.beginPath();
  this.ctx.moveTo(element.x + element.width, element.y + element.height + 12);
  this.ctx.lineTo(element.x + element.width + 24, element.y + element.height + 12);
  this.ctx.lineTo(element.x + element.width + 12, element.y + element.height + 24);
  this.ctx.stroke();
}

private drawTextBoxHandles(box: { x: number; y: number; width: number; height: number }): void {
  const handleSize = 12;
  const buttonSize = 24;
  
  // Corner handles
  this.ctx.fillStyle = '#4F46E5';
  this.ctx.fillRect(box.x - handleSize / 2, box.y - handleSize / 2, handleSize, handleSize);
  this.ctx.fillRect(box.x + box.width - handleSize / 2, box.y - handleSize / 2, handleSize, handleSize);
  this.ctx.fillRect(box.x - handleSize / 2, box.y + box.height - handleSize / 2, handleSize, handleSize);
  this.ctx.fillRect(box.x + box.width - handleSize / 2, box.y + box.height - handleSize / 2, handleSize, handleSize);
  
  // Delete button for text box (top-right corner)
  this.ctx.fillStyle = '#EF4444';
  this.ctx.beginPath();
  this.ctx.arc(box.x + box.width + 12, box.y - 12, buttonSize / 2, 0, Math.PI * 2);
  this.ctx.fill();
  
  // X mark
  this.ctx.strokeStyle = 'white';
  this.ctx.lineWidth = 3;
  this.ctx.beginPath();
  this.ctx.moveTo(box.x + box.width + 6, box.y - 18);
  this.ctx.lineTo(box.x + box.width + 18, box.y - 6);
  this.ctx.moveTo(box.x + box.width + 18, box.y - 18);
  this.ctx.lineTo(box.x + box.width + 6, box.y - 6);
  this.ctx.stroke();
}

  private drawResizeHandles(element: CanvasElement): void {
    const handleSize = 12;
    const handles = [
      { x: element.x - handleSize / 2, y: element.y - handleSize / 2 },
      { x: element.x + element.width - handleSize / 2, y: element.y - handleSize / 2 },
      { x: element.x - handleSize / 2, y: element.y + element.height - handleSize / 2 },
      { x: element.x + element.width - handleSize / 2, y: element.y + element.height - handleSize / 2 }
    ];
    
    this.ctx.fillStyle = '#4F46E5';
    handles.forEach(handle => {
      this.ctx.fillRect(handle.x, handle.y, handleSize, handleSize);
    });
  }

  onCanvasMouseDown(event: MouseEvent): void {
    event.preventDefault();
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleRatio = this.canvasWidth / (this.displayWidth * this.scale * this.zoom);
    const x = (event.clientX - rect.left) * scaleRatio;
    const y = (event.clientY - rect.top) * scaleRatio;
  
    if (this.isTyping && this.textBox && this.isPointInTextBox(x, y, this.textBox)) {
      this.isMouseSelecting = true;
      this.cursorPosition = this.getClickedCursorPosition(x, y);
      this.selectionStart = this.cursorPosition;
      this.selectionEnd = this.cursorPosition;
      this.cursorBlinkVisible = true;
      this.drawCanvas();
      return;
    }
  
    // Handle text box delete button
    if (this.textBox) {
      const deleteBoxDist = Math.sqrt(
        Math.pow(x - (this.textBox.x + this.textBox.width + 12), 2) + 
        Math.pow(y - (this.textBox.y - 12), 2)
      );
      if (deleteBoxDist < 12) {
        this.removeTextBox();
        return;
      }
    }
  
    // Check if clicking on element control buttons or body
    for (let i = this.canvasElements.length - 1; i >= 0; i--) {
      const element = this.canvasElements[i];
      
      // Skip elements not on current page
      if (element.pageNumber && element.pageNumber !== this.currentPage) {
        continue;
      }
      
      // Check delete button
      const deleteDist = Math.sqrt(Math.pow(x - (element.x + element.width + 12), 2) + Math.pow(y - (element.y - 12), 2));
      if (deleteDist < 30) {
        this.canvasElements = this.canvasElements.filter(el => el.id !== element.id);
        this.selectedElement = null;
        this.isTextMode = false;
        this.drawCanvas();
        return;
      }
  
      // Check drag button
      const dragDist = Math.sqrt(Math.pow(x - (element.x - 12), 2) + Math.pow(y - (element.y - 12), 2));
      if (dragDist < 30) {
        this.selectedElement = element;
        this.selectedElement.isDragging = true;
        this.dragOffset = { x: x - element.x, y: y - element.y };
        this.drawCanvas();
        return;
      }
  
      // Check resize button
      const resizeDist = Math.sqrt(Math.pow(x - (element.x + element.width + 12), 2) + Math.pow(y - (element.y + element.height + 12), 2));
      if (resizeDist < 30) {
        this.selectedElement = element;
        this.selectedElement.isResizing = true;
        this.dragOffset = { x: element.width, y: element.height };
        this.drawCanvas();
        return;
      }
      
      // Check if clicking on element body - OPEN MODAL FOR TEXT BODY ELEMENTS
      if (this.isPointInElement(x, y, element)) {
        if (element.id.startsWith('textBody_')) {
          // Open modal to edit text body
          this.openTextBodyModal();
          return;
        } else {
          // For other elements, enable dragging
          this.selectedElement = element;
          this.selectedElement.isDragging = true;
          this.dragOffset = { x: x - element.x, y: y - element.y };
          this.drawCanvas();
          return;
        }
      }
    }
  
    // Deselect
    this.selectedElement = null;
    this.drawCanvas();
  }

private isPointInTextBox(x: number, y: number, textBox: any): boolean {
  return x >= textBox.x && x <= textBox.x + textBox.width &&
         y >= textBox.y && y <= textBox.y + textBox.height;
}

onCanvasMouseMove(event: MouseEvent): void {
  event.preventDefault(); // Add this
  if (!this.selectedElement) return;

  if (this.isMouseSelecting && this.textBox) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleRatio = this.canvasWidth / (this.displayWidth * this.scale * this.zoom);
    const x = (event.clientX - rect.left) * scaleRatio;
    const y = (event.clientY - rect.top) * scaleRatio;
    
    this.cursorPosition = this.getClickedCursorPosition(x, y);
    this.selectionEnd = this.cursorPosition;
    
    // Ensure selectionStart is always less than selectionEnd
    if (this.selectionEnd < this.selectionStart) {
      [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
    }
    
    this.drawCanvas();
    return;
  }
  
  const rect = this.canvasRef.nativeElement.getBoundingClientRect();
  const scaleRatio = this.canvasWidth / (this.displayWidth * this.scale * this.zoom);
  const x = (event.clientX - rect.left) * scaleRatio;
  const y = (event.clientY - rect.top) * scaleRatio;

    if (this.isDraggingTextBox && this.textBox) {
    this.textBox.x = x - this.textBoxDragOffset.x;
    this.textBox.y = y - this.textBoxDragOffset.y;
    this.drawCanvas();
    return;
  }
  
  if (this.selectedElement.isDragging) {
    this.selectedElement.x = x - this.dragOffset.x;
    this.selectedElement.y = y - this.dragOffset.y;
    this.drawCanvas();
  } else if (this.selectedElement.isResizing) {
    const newWidth = Math.max(50, x - this.selectedElement.x);
    const newHeight = Math.max(50, y - this.selectedElement.y);
    const aspectRatio = this.dragOffset.x / this.dragOffset.y;
    
    this.selectedElement.width = newWidth;
    this.selectedElement.height = newWidth / aspectRatio;
    this.drawCanvas();
  }
}

onCanvasMouseUp(): void {
  this.isMouseSelecting = false;
  this.isDraggingTextBox = false;
  if (this.selectedElement) {
    this.selectedElement.isDragging = false;
    this.selectedElement.isResizing = false;
  }
}

@HostListener('document:keydown', ['$event'])
onKeyDown(event: KeyboardEvent): void {
  // Handle Ctrl shortcuts FIRST (before checking isTyping)
  if (event.ctrlKey && event.key === 'v') {
    // Don't prevent default, let paste handler work
    return;
  }
  
  if (event.ctrlKey && (event.key === 'c' || event.key === 'x')) {
    // Allow default copy/cut behavior
    return;
  }
  
  if (this.isTyping && this.textBox) {
    if (event.ctrlKey && event.key === 'a') {
      event.preventDefault();
      this.selectionStart = 0;
      this.selectionEnd = this.textBox.text.length;
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'Escape') {
      // Save and exit
      if (this.textBox && this.textBox.text.trim()) {
        const element: CanvasElement = {
          id: this.selectedElement?.id || `text_${Date.now()}`,
          type: 'text',
          x: this.textBox.x,
          y: this.textBox.y,
          width: this.textBox.width,
          height: this.textBox.height,
          text: this.textBox.text,
          fontSize: this.fontSize,
          fontFamily: this.fontFamily,
          fontWeight: this.fontWeight,
          fontStyle: this.fontStyle,
          textDecoration: this.textDecoration,
          color: this.textColor,
          isTemplateText: this.selectedElement?.isTemplateText || false,
          richTextSegments: this.selectedElement?.richTextSegments  // PRESERVE RICH TEXT
        };
        this.canvasElements.push(element);
      }
      
      this.isTyping = false;
      this.textBox = null;
      this.isTextMode = false;
      this.selectedElement = null;
      this.cursorPosition = 0;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (event.shiftKey) {
        // Shift+Arrow: extend selection
        if (this.selectionStart === this.selectionEnd) {
          this.selectionStart = this.cursorPosition;
        }
        this.cursorPosition = Math.max(0, this.cursorPosition - 1);
        this.selectionEnd = this.cursorPosition;
      } else {
        // Clear selection and move cursor
        if (this.selectionEnd > this.selectionStart) {
          this.cursorPosition = this.selectionStart;
          this.selectionStart = 0;
          this.selectionEnd = 0;
        } else {
          this.cursorPosition = Math.max(0, this.cursorPosition - 1);
        }
      }
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (event.shiftKey) {
        // Shift+Arrow: extend selection
        if (this.selectionStart === this.selectionEnd) {
          this.selectionStart = this.cursorPosition;
        }
        this.cursorPosition = Math.min(this.textBox.text.length, this.cursorPosition + 1);
        this.selectionEnd = this.cursorPosition;
      } else {
        // Clear selection and move cursor
        if (this.selectionEnd > this.selectionStart) {
          this.cursorPosition = this.selectionEnd;
          this.selectionStart = 0;
          this.selectionEnd = 0;
        } else {
          this.cursorPosition = Math.min(this.textBox.text.length, this.cursorPosition + 1);
        }
      }
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      // Simple up/down - move by approximate line length
      const avgLineLength = 50;
      if (event.key === 'ArrowUp') {
        this.cursorPosition = Math.max(0, this.cursorPosition - avgLineLength);
      } else {
        this.cursorPosition = Math.min(this.textBox.text.length, this.cursorPosition + avgLineLength);
      }
      // Clear selection
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'Home') {
      event.preventDefault();
      this.cursorPosition = 0;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'End') {
      event.preventDefault();
      this.cursorPosition = this.textBox.text.length;
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.selectionEnd > this.selectionStart) {
        // Replace selection with newline
        this.textBox.text = this.textBox.text.slice(0, this.selectionStart) + 
                            '\n' + 
                            this.textBox.text.slice(this.selectionEnd);
        this.cursorPosition = this.selectionStart + 1;
        this.selectionStart = 0;
        this.selectionEnd = 0;
      } else {
        // Insert newline
        this.textBox.text = this.textBox.text.slice(0, this.cursorPosition) + 
                            '\n' + 
                            this.textBox.text.slice(this.cursorPosition);
        this.cursorPosition++;
      }
      
      // Auto-adjust height
      const lineCount = (this.textBox.text.match(/\n/g) || []).length + 1;
      const scaleRatio = this.canvasWidth / this.displayWidth;
      const estimatedHeight = lineCount * this.fontSize * 1.4 * scaleRatio + 40 * scaleRatio;
      if (estimatedHeight > this.textBox.height) {
        this.textBox.height = Math.min(estimatedHeight, this.canvasHeight - this.textBox.y - 50 * scaleRatio);
      }
      
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.selectionEnd > this.selectionStart) {
        // Delete selection
        this.textBox.text = this.textBox.text.slice(0, this.selectionStart) + 
                            this.textBox.text.slice(this.selectionEnd);
        this.cursorPosition = this.selectionStart;
        this.selectionStart = 0;
        this.selectionEnd = 0;
      } else if (this.cursorPosition > 0) {
        this.textBox.text = this.textBox.text.slice(0, this.cursorPosition - 1) + 
                            this.textBox.text.slice(this.cursorPosition);
        this.cursorPosition--;
      }
      this.drawCanvas();
      return;
    }
    
    if (event.key === 'Delete') {
      event.preventDefault();
      if (this.selectionEnd > this.selectionStart) {
        // Delete selection
        this.textBox.text = this.textBox.text.slice(0, this.selectionStart) + 
                            this.textBox.text.slice(this.selectionEnd);
        this.cursorPosition = this.selectionStart;
        this.selectionStart = 0;
        this.selectionEnd = 0;
      } else if (this.cursorPosition < this.textBox.text.length) {
        this.textBox.text = this.textBox.text.slice(0, this.cursorPosition) + 
                            this.textBox.text.slice(this.cursorPosition + 1);
      }
      this.drawCanvas();
      return;
    }
    
    if (event.key.length === 1 || event.key === ' ') {
      event.preventDefault();
      // Check if there's a selection
      if (this.selectionEnd > this.selectionStart) {
        // Replace selected text
        this.textBox.text = this.textBox.text.slice(0, this.selectionStart) + 
                            event.key + 
                            this.textBox.text.slice(this.selectionEnd);
        this.cursorPosition = this.selectionStart + 1;
        this.selectionStart = 0;
        this.selectionEnd = 0;
      } else {
        // Normal insert
        this.textBox.text = this.textBox.text.slice(0, this.cursorPosition) + 
                            event.key + 
                            this.textBox.text.slice(this.cursorPosition);
        this.cursorPosition++;
      }
      
      // Auto-adjust height if text is getting too long
      const lineCount = (this.textBox.text.match(/\n/g) || []).length + 1;
      const scaleRatio = this.canvasWidth / this.displayWidth;
      const estimatedHeight = lineCount * this.fontSize * 1.4 * scaleRatio + 40 * scaleRatio;
      if (estimatedHeight > this.textBox.height) {
        this.textBox.height = Math.min(estimatedHeight, this.canvasHeight - this.textBox.y - 50 * scaleRatio);
      }
      
      this.drawCanvas();
      return;
    }
    
    return;
  }
  
  // Handle delete key for selected elements (when not typing)
  if (event.key === 'Delete' && this.selectedElement) {
    this.canvasElements = this.canvasElements.filter(el => el.id !== this.selectedElement!.id);
    this.selectedElement = null;
    this.drawCanvas();
  }
}

@HostListener('document:paste', ['$event'])
onPaste(event: ClipboardEvent): void {
  if (this.isTyping && this.textBox) {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text') || '';
    
    if (this.selectionEnd > this.selectionStart) {
      // Replace selection with pasted text
      this.textBox.text = this.textBox.text.slice(0, this.selectionStart) + 
                          pastedText + 
                          this.textBox.text.slice(this.selectionEnd);
      this.cursorPosition = this.selectionStart + pastedText.length;
      this.selectionStart = 0;
      this.selectionEnd = 0;
    } else {
      this.textBox.text = this.textBox.text.slice(0, this.cursorPosition) + 
                          pastedText + 
                          this.textBox.text.slice(this.cursorPosition);
      this.cursorPosition += pastedText.length;
    }
    this.drawCanvas();
  }
}

@HostListener('dblclick', ['$event'])
onCanvasDoubleClick(event: MouseEvent): void {
  const rect = this.canvasRef.nativeElement.getBoundingClientRect();
  const scaleRatio = this.canvasWidth / (this.displayWidth * this.scale * this.zoom);
  const x = (event.clientX - rect.left) * scaleRatio;
  const y = (event.clientY - rect.top) * scaleRatio;

  // Check if double-clicking on a text element
  for (let i = this.canvasElements.length - 1; i >= 0; i--) {
    const element = this.canvasElements[i];
    if (element.type === 'text' && this.isPointInElement(x, y, element)) {
      this.openEditModal(element);
      return;
    }
  }
}

openEditModal(element: CanvasElement): void {
  this.editingElement = element;
  this.editingText = element.text || '';
  this.showEditModal = true;
}

closeEditModal(): void {
  this.showEditModal = false;
  this.editingElement = null;
  this.editingText = '';
}

confirmTextEdit(): void {
  if (this.editingElement && this.editingText.trim()) {
    // Find the element in the array and update it
    const index = this.canvasElements.findIndex(el => el.id === this.editingElement!.id);
    if (index !== -1) {
      this.canvasElements[index].text = this.editingText;
      this.drawCanvas();
      this.showStatus('Text updated!', 'success');
    }
  }
  this.closeEditModal();
}

  private isPointInElement(x: number, y: number, element: CanvasElement): boolean {
    return x >= element.x && x <= element.x + element.width &&
           y >= element.y && y <= element.y + element.height;
  }

  private addTextElement(): void {
    if (!this.currentText.trim()) return;
    
    const scaleFactor = this.canvasWidth / this.displayWidth;
    
    const element: CanvasElement = {
      id: `text_${Date.now()}`,
      type: 'text',
      x: this.textCursor.x,
      y: this.textCursor.y,
      width: 200 * scaleFactor,
      height: this.fontSize * scaleFactor,
      text: this.currentText,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      textDecoration: this.textDecoration,
      color: this.textColor
    };
    
    this.canvasElements.push(element);
    this.drawCanvas();
  }

toggleTextMode(): void {
  this.isTextMode = !this.isTextMode;
  this.textCursor.visible = false;
  this.currentText = '';
  this.selectedElement = null;

  // Auto-apply default template when entering text mode
  if (this.isTextMode) {
    this.applyTemplate();
  }

  this.drawCanvas();
}

removeTextBox(): void {
  this.textBox = null;
  this.isTyping = false;
  this.isTextMode = false;
  this.selectedElement = null;  // Make sure to clear this
  this.cursorPosition = 0;
  this.selectionStart = 0;
  this.selectionEnd = 0;
  this.drawCanvas();
}

  toggleBold(): void {
    this.fontWeight = this.fontWeight === 'bold' ? 'normal' : 'bold';
  }

  toggleItalic(): void {
    this.fontStyle = this.fontStyle === 'italic' ? 'normal' : 'italic';
  }

  toggleUnderline(): void {
    this.textDecoration = this.textDecoration === 'underline' ? 'none' : 'underline';
  }

  zoomIn(): void {
    this.zoom = Math.min(this.zoom + 0.1, 2);
    this.applyScale();
  }

  zoomOut(): void {
    this.zoom = Math.max(this.zoom - 0.1, 0.5);
    this.applyScale();
  }

  resetZoom(): void {
    this.zoom = 1;
    this.applyScale();
  }

  async exportAsPDF(): Promise<void> {
    this.showStatus('Generating PDF...', 'processing');
    
    try {
      this.isExporting = true;
      const previousSelected = this.selectedElement;
      const previousPage = this.currentPage;
      this.selectedElement = null;
      
      const totalPages = this.getTotalPages();
      const pdfPages: {imageData: string, width: number, height: number}[] = [];
      
      // Render each page
      for (let page = 1; page <= totalPages; page++) {
        this.currentPage = page;
        this.drawCanvas();
        
        // Wait for images to load
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const canvas = this.canvasRef.nativeElement;
        
        // Use lower quality JPEG to reduce file size
        const imgData = canvas.toDataURL('image/jpeg', 0.7); // Reduced from 0.95 to 0.7
        pdfPages.push({
          imageData: imgData,
          width: canvas.width,
          height: canvas.height
        });
      }
      
      // Create multi-page PDF with jsPDF library approach (simplified)
      const pdfBlob = await this.createSimplifiedMultiPagePDF(pdfPages);
      this.downloadPDFBlob(pdfBlob, 'letter.pdf');
      
      this.isExporting = false;
      this.selectedElement = previousSelected;
      this.currentPage = previousPage;
      this.drawCanvas();
      this.showStatus(`PDF exported (${totalPages} page${totalPages > 1 ? 's' : ''})!`, 'success');
    } catch (error) {
      this.isExporting = false;
      this.currentPage = 1;
      this.showStatus('Export failed', 'error');
      console.error(error);
    }
  }
  
  private async createSimplifiedMultiPagePDF(pages: {imageData: string, width: number, height: number}[]): Promise<Blob> {
    const pdfWidth = (pages[0].width * 72 / 300); // Convert to points
    const pdfHeight = (pages[0].height * 72 / 300);
    
    let pdfContent = `%PDF-1.4
  `;
    const objects: string[] = [];
    let currentObjectNum = 1;
    
    // Object 1: Catalog
    objects.push(`${currentObjectNum} 0 obj
  << /Type /Catalog /Pages ${currentObjectNum + 1} 0 R >>
  endobj
  `);
    currentObjectNum++;
    
    // Object 2: Pages
    const pagesObjectNum = currentObjectNum;
    const pageObjectNums: number[] = [];
    
    // Calculate object numbers
    for (let i = 0; i < pages.length; i++) {
      pageObjectNums.push(currentObjectNum + 1 + (i * 3));
    }
    
    objects.push(`${pagesObjectNum} 0 obj
  << /Type /Pages /Kids [${pageObjectNums.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>
  endobj
  `);
    currentObjectNum++;
    
    // Create objects for each page
    const imageDataArray: Uint8Array[] = [];
    
    for (let i = 0; i < pages.length; i++) {
      const pageObjNum = currentObjectNum++;
      const contentObjNum = currentObjectNum++;
      const imageObjNum = currentObjectNum++;
      
      // Page object
      objects.push(`${pageObjNum} 0 obj
  << /Type /Page /Parent ${pagesObjectNum} 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Contents ${contentObjNum} 0 R /Resources << /XObject << /Im${i} ${imageObjNum} 0 R >> >> >>
  endobj
  `);
      
      // Content stream
      const contentStream = `q
  ${pdfWidth} 0 0 ${pdfHeight} 0 0 cm
  /Im${i} Do
  Q`;
      objects.push(`${contentObjNum} 0 obj
  << /Length ${contentStream.length} >>
  stream
  ${contentStream}
  endstream
  endobj
  `);
      
      // Convert image to bytes
      const base64Data = pages[i].imageData.split(',')[1];
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let j = 0; j < len; j++) {
        bytes[j] = binaryString.charCodeAt(j);
      }
      imageDataArray.push(bytes);
      
      // Image object (header only, data added later)
      objects.push(`${imageObjNum} 0 obj
  << /Type /XObject /Subtype /Image /Width ${pages[i].width} /Height ${pages[i].height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>
  stream
  `);
    }
    
    // Build PDF
    const encoder = new TextEncoder();
    let pdfBytes = encoder.encode(pdfContent);
    const offsets: number[] = [0];
    
    // Add objects
    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdfBytes.length);
      const objBytes = encoder.encode(objects[i]);
      const newBytes = new Uint8Array(pdfBytes.length + objBytes.length);
      newBytes.set(pdfBytes);
      newBytes.set(objBytes, pdfBytes.length);
      pdfBytes = newBytes;
      
      // Add image data if this is an image stream
      if (objects[i].includes('/Filter /DCTDecode')) {
        const imageIndex = Math.floor((i - 3) / 3); // Calculate which image
        if (imageIndex >= 0 && imageIndex < imageDataArray.length) {
          const imgBytes = imageDataArray[imageIndex];
          const endStream = encoder.encode(`
  endstream
  endobj
  `);
          
          const combined = new Uint8Array(pdfBytes.length + imgBytes.length + endStream.length);
          combined.set(pdfBytes);
          combined.set(imgBytes, pdfBytes.length);
          combined.set(endStream, pdfBytes.length + imgBytes.length);
          pdfBytes = combined;
        }
      }
    }
    
    // Add xref table
    const xrefStart = pdfBytes.length;
    let xref = `xref
  0 ${currentObjectNum}
  0000000000 65535 f 
  `;
    
    for (let i = 1; i < offsets.length; i++) {
      xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    
    xref += `trailer
  << /Size ${currentObjectNum} /Root 1 0 R >>
  startxref
  ${xrefStart}
  %%EOF`;
    
    const xrefBytes = encoder.encode(xref);
    const finalPdf = new Uint8Array(pdfBytes.length + xrefBytes.length);
    finalPdf.set(pdfBytes);
    finalPdf.set(xrefBytes, pdfBytes.length);
    
    return new Blob([finalPdf], { type: 'application/pdf' });
  }
  
  private downloadPDFBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }



  exportAsImage(): void {
    this.showStatus('Generating image...', 'processing');
    
    try {
      const canvas = this.canvasRef.nativeElement;
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'letter.png';
          a.click();
          URL.revokeObjectURL(url);
          this.showStatus('Image exported!', 'success');
        }
      }, 'image/png', 1.0);
    } catch (error) {
      this.showStatus('Export failed', 'error');
      console.error(error);
    }
  }

  private createPDF(pageWidth: number, pageHeight: number, imageDataURL: string): Uint8Array {
    const pdfWidth = (pageWidth * 72 / 300).toFixed(2);
    const pdfHeight = (pageHeight * 72 / 300).toFixed(2);
    
    const base64Data = imageDataURL.split(',')[1];
    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    let pdf = '%PDF-1.4\n%âãÏÓ\n';
    const offsets = [0];
    
    offsets.push(pdf.length);
    pdf += '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n\n';
    
    offsets.push(pdf.length);
    pdf += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n\n';
    
    offsets.push(pdf.length);
    pdf += `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n\n`;
    
    const contentStream = `q\n${pdfWidth} 0 0 ${pdfHeight} 0 0 cm\n/Im1 Do\nQ`;
    offsets.push(pdf.length);
    pdf += `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n\n`;
    
    offsets.push(pdf.length);
    const imgObjHeader = `5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`;
    pdf += imgObjHeader;
    
    const encoder = new TextEncoder();
    const pdfBytes = encoder.encode(pdf);
    const endStream = '\nendstream\nendobj\n\n';
    const endStreamBytes = encoder.encode(endStream);
    
    const finalPdfBytes = new Uint8Array(pdfBytes.length + bytes.length + endStreamBytes.length);
    finalPdfBytes.set(pdfBytes, 0);
    finalPdfBytes.set(bytes, pdfBytes.length);
    finalPdfBytes.set(endStreamBytes, pdfBytes.length + bytes.length);
    
    const xrefStart = finalPdfBytes.length;
    let xrefSection = 'xref\n0 6\n0000000000 65535 f \n';
    
    for (let i = 1; i < offsets.length; i++) {
      xrefSection += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    }
    
    xrefSection += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';
    
    const xrefBytes = encoder.encode(xrefSection);
    const completePdf = new Uint8Array(finalPdfBytes.length + xrefBytes.length);
    completePdf.set(finalPdfBytes, 0);
    completePdf.set(xrefBytes, finalPdfBytes.length);
    
    return completePdf;
  }

  private downloadPDF(pdfContent: Uint8Array, filename: string): void {
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private showStatus(message: string, type: string): void {
    this.statusMessage = message;
    this.statusType = type;
    
    if (type === 'success') {
      setTimeout(() => {
        this.statusMessage = '';
        this.statusType = '';
      }, 2000);
    }
  }


applyTemplate(): void {
  // Check if there are existing template elements
  const hasExistingTemplate = this.canvasElements.some(el => el.isTemplateText);
  const hasOtherElements = this.canvasElements.some(el => !el.isTemplateText);
  
  if (hasExistingTemplate || hasOtherElements) {
    const confirmMessage = hasOtherElements 
      ? 'Applying a new template will remove all existing content. Continue?' 
      : 'Applying a new template will replace the current template. Continue?';
    
    if (!confirm(confirmMessage)) {
      return; // User cancelled
    }
  }

  // Remove ALL elements if user confirmed
  this.canvasElements = [];

  const scaleFactor = this.canvasWidth / this.displayWidth;

  const boxWidth = this.canvasWidth * 0.85;
  const boxHeight = this.canvasHeight * 0.75;
  const boxX = (this.canvasWidth - boxWidth) / 2;
  const boxY = 200 * scaleFactor;

  const templateText = this.getTemplateText(this.selectedTemplate);

  const element: CanvasElement = {
    id: `templateText_${Date.now()}`,
    type: 'text',
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    text: templateText,
    fontSize: 16,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    color: '#000000',
    isTemplateText: true
  };

  this.canvasElements.push(element);
  this.drawCanvas();
  this.showStatus('Template applied!', 'success');
}



private getTemplateText(template: string): string {
  const date = new Date().toLocaleDateString();
  const senderName = '[Your Full Name]';
  const senderTitle = '[Your Job Title]';
  const recipientName = '[Recipient Full Name]';
  const recipientTitle = '[Recipient Job Title]';
  const companyName = '[Company Name]';
  const address = '[Street Address, City, State, ZIP Code]';
  const email = '[your.email@example.com]';
  const phone = '[Your Phone Number]';

  switch (template) {
    case 'standard':
      return `${date}\n\n${recipientName}\n${recipientTitle}\n${companyName}\n${address}\n\nDear ${recipientName},\n\nI am writing to formally express my interest in the position advertised on your website. I believe my skills and experience align well with the requirements of the role.\n\n[Body placeholder: Insert your message here. Highlight your qualifications, relevant experience, and why you are interested in this specific opportunity.]\n\nThank you for your time and consideration. I look forward to discussing how I can contribute to ${companyName}.\n\nSincerely,\n\n${senderName}\n${senderTitle}\n${email}\n${phone}`;

    case 'cover':
      return `${date}\n\nHiring Manager\n${companyName}\n${address}\n\nDear Hiring Manager,\n\nSubject: Application for [Position Title]\n\nI am excited to apply for the [Position Title] position at ${companyName}. With [X years] of experience in [relevant field], I bring a proven track record of [mention key achievement or skill].\n\n[Body placeholder: Briefly summarize your most relevant accomplishments and explain why you are a strong fit for this specific role. Connect your skills directly to the job description.]\n\nEnclosed is my resume for your review. I welcome the opportunity to discuss my application further.\n\nSincerely,\n\n${senderName}\n${email}\n${phone}`;

    case 'casual':
      return `${date}\n\nHi ${recipientName},\n\nHope you're doing well! I'm reaching out to ask about [briefly state your purpose - e.g., availability of a product, information on an event, etc.].\n\n[Body placeholder: Keep it friendly and concise. Ask your question clearly and mention any context if needed.]\n\nLooking forward to hearing from you!\n\nBest regards,\n\n${senderName}\n${email}\n${phone}`;

    case 'thankyou':
      return `${date}\n\n${recipientName}\n${recipientTitle}\n${companyName}\n${address}\n\nDear ${recipientName},\n\nThank you so much for [specifically mention what you are thanking them for - e.g., taking the time to interview me, providing feedback, offering the opportunity]. I truly appreciate your [kindness/consideration/time/effort].\n\n[Body placeholder: Elaborate briefly on why you are grateful. Mention something specific that made a positive impression. Reiterate your interest if applicable.]\n\nI look forward to [next step or future interaction].\n\nSincerely,\n\n${senderName}\n${email}\n${phone}`;

    default:
      return `${date}\n\n${recipientName}\n${recipientTitle}\n${companyName}\n${address}\n\nDear ${recipientName},\n\n[Start typing your letter here...]\n\nSincerely,\n\n${senderName}`;
  }
}

private getClickedCursorPosition(clickX: number, clickY: number): number {
  if (!this.textBox) return 0;
  
  const scaleRatio = this.canvasWidth / this.displayWidth;
  const fontSize = this.fontSize * scaleRatio;
  const padding = 20 * scaleRatio;
  const maxWidth = this.textBox.width - 40 * scaleRatio;
  const lineHeight = fontSize * 1.4;
  
  this.ctx.font = `${this.fontStyle} ${this.fontWeight} ${fontSize}px ${this.fontFamily}`;
  
  // Build lines with character positions
  const lines: {text: string, charStart: number, charEnd: number}[] = [];
  let charCount = 0;
  
  const paragraphs = this.textBox.text.split('\n');
  paragraphs.forEach((paragraph, pIndex) => {
    if (paragraph.trim() === '') {
      lines.push({text: '', charStart: charCount, charEnd: charCount});
      charCount += 1;
      return;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';
    let lineStartChar = charCount;
    
    words.forEach((word) => {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push({text: currentLine, charStart: lineStartChar, charEnd: charCount + currentLine.length});
        charCount += currentLine.length + 1;
        currentLine = word;
        lineStartChar = charCount;
      } else {
        currentLine = testLine;
      }
    });
    
    if (currentLine) {
      lines.push({text: currentLine, charStart: lineStartChar, charEnd: charCount + currentLine.length});
      charCount += currentLine.length;
    }
    
    if (pIndex < paragraphs.length - 1) {
      charCount += 1;
    }
  });
  
  // Find which line was clicked
  const relativeY = clickY - this.textBox.y - padding;
  const clickedLineIndex = Math.floor(relativeY / lineHeight);
  const lineIndex = Math.max(0, Math.min(clickedLineIndex, lines.length - 1));
  
  if (lineIndex >= lines.length) {
    return this.textBox.text.length;
  }
  
  const line = lines[lineIndex];
  const relativeX = clickX - this.textBox.x - padding;
  
  // Find character in line
  let closestChar = line.charStart;
  let minDistance = Infinity;
  
  for (let i = 0; i <= line.text.length; i++) {
    const textSegment = line.text.substring(0, i);
    const charX = this.ctx.measureText(textSegment).width;
    const distance = Math.abs(charX - relativeX);
    
    if (distance < minDistance) {
      minDistance = distance;
      closestChar = line.charStart + i;
    }
  }
  
  return closestChar;
}

private async handleWordFile(file: File): Promise<{ text: string, segments: Array<{text: string, bold?: boolean, italic?: boolean}> }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = result.value;
    
    const segments: Array<{text: string, bold?: boolean, italic?: boolean}> = [];
    let plainText = '';
    
    const processNode = (node: Node, currentBold = false, currentItalic = false): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || '';
        if (text.trim()) {
          segments.push({
            text: text,
            bold: currentBold,
            italic: currentItalic
          });
          plainText += text;
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();
        
        const isBold = currentBold || tagName === 'strong' || tagName === 'b';
        const isItalic = currentItalic || tagName === 'em' || tagName === 'i';
        
        if (tagName === 'p' || tagName === 'div') {
          element.childNodes.forEach(child => processNode(child, isBold, isItalic));
          segments.push({ text: '\n' });
          plainText += '\n';
        } else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
          element.childNodes.forEach(child => processNode(child, true, isItalic)); // Headings are bold
          segments.push({ text: '\n' });
          plainText += '\n';
        } else if (tagName === 'br') {
          segments.push({ text: '\n' });
          plainText += '\n';
        } else if (tagName === 'table') {
          // PROCESS TABLE: Convert to readable format
          const rows = element.querySelectorAll('tr');
          rows.forEach((row, rowIdx) => {
            const cells = row.querySelectorAll('td, th');
            const isHeader = row.querySelector('th') !== null;
            
            cells.forEach((cell, cellIdx) => {
              const cellText = cell.textContent?.trim() || '';
              if (cellText) {
                segments.push({
                  text: cellText,
                  bold: isHeader || currentBold
                });
                plainText += cellText;
                
                // Add spacing between cells
                if (cellIdx < cells.length - 1) {
                  segments.push({ text: ': ' });
                  plainText += ': ';
                }
              }
            });
            
            // New line after each row
            segments.push({ text: '\n' });
            plainText += '\n';
          });
          
          // Extra line after table
          segments.push({ text: '\n' });
          plainText += '\n';
        } else if (tagName === 'tr') {
          // Skip - handled in table processing
          return;
        } else if (tagName === 'td' || tagName === 'th') {
          // Skip - handled in table processing
          return;
        } else {
          element.childNodes.forEach(child => processNode(child, isBold, isItalic));
        }
      }
    };
    
    tempDiv.childNodes.forEach(node => processNode(node));
    
    // Clean up plain text
    plainText = plainText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !/^[\+\-\|\=\s]+$/.test(l))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    // Clean up segments - remove empty ones
    const cleanedSegments = segments.filter(seg => 
      seg.text === '\n' || seg.text.trim().length > 0
    );
    
    return { text: plainText, segments: cleanedSegments };
    
  } catch (error) {
    console.error('Error reading Word file:', error);
    throw error;
  }
}


openTextBodyModal(): void {
  // Collect ALL text body elements from ALL pages
  const textBodyElements = this.canvasElements
    .filter(el => el.id.startsWith('textBody_'))
    .sort((a, b) => (a.pageNumber || 0) - (b.pageNumber || 0));
  
  if (textBodyElements.length > 0) {
    // Combine text from all pages
    this.textBodyContent = textBodyElements
      .map(el => el.text)
      .join('\n\n'); // Add spacing between pages
    
    // Use formatting from first element
    const firstElement = textBodyElements[0];
    this.modalFontFamily = firstElement.fontFamily || 'Arial';
    this.modalFontSize = firstElement.fontSize || 16;
    this.modalFontWeight = firstElement.fontWeight || 'normal';
    this.modalFontStyle = firstElement.fontStyle || 'normal';
    this.modalTextDecoration = firstElement.textDecoration || 'none';
    this.modalTextColor = firstElement.color || '#000000';
  } else {
    // Reset to defaults
    this.textBodyContent = '';
    this.modalFontFamily = 'Arial';
    this.modalFontSize = 16;
    this.modalFontWeight = 'normal';
    this.modalFontStyle = 'normal';
    this.modalTextDecoration = 'none';
    this.modalTextColor = '#000000';
  }
  
  this.showTextBodyModal = true;
}

closeTextBodyModal(): void {
  this.showTextBodyModal = false;
  this.textBodyContent = '';
}

toggleModalBold(): void {
  this.modalFontWeight = this.modalFontWeight === 'bold' ? 'normal' : 'bold';
}

toggleModalItalic(): void {
  this.modalFontStyle = this.modalFontStyle === 'italic' ? 'normal' : 'italic';
}

toggleModalUnderline(): void {
  this.modalTextDecoration = this.modalTextDecoration === 'underline' ? 'none' : 'underline';
}

applyTextBody(): void {
  if (!this.textBodyContent.trim()) {
    this.showStatus('Please enter some text', 'error');
    return;
  }

  // Remove any existing text body elements
  this.canvasElements = this.canvasElements.filter(el => !el.id.startsWith('textBody_'));

  const scaleFactor = this.canvasWidth / this.displayWidth;
  
  // Better spacing calculations
  const leftMargin = 80 * scaleFactor;
  const rightMargin = 80 * scaleFactor;
  const topMargin = 180 * scaleFactor; // Space for header
  const bottomMargin = 250 * scaleFactor; // Space for signature
  
  const boxWidth = this.canvasWidth - leftMargin - rightMargin;
  const boxHeight = this.canvasHeight - topMargin - bottomMargin;
  
  // Split text into pages
  const pages = this.splitTextIntoPages(
    this.textBodyContent,
    boxWidth,
    boxHeight,
    this.modalFontSize,
    this.modalFontFamily,
    this.modalFontWeight,
    this.modalFontStyle
  );
  
  if (pages.length > 1) {
    this.showStatus(`Content split into ${pages.length} pages`, 'success');
  }
  
  // Create text elements for each page
  pages.forEach((pageText, index) => {
    const element: CanvasElement = {
      id: `textBody_${Date.now()}_page${index + 1}`,
      type: 'text',
      x: leftMargin,
      y: topMargin,
      width: boxWidth,
      height: boxHeight,
      text: pageText,
      fontSize: this.modalFontSize,
      fontFamily: this.modalFontFamily,
      fontWeight: this.modalFontWeight,
      fontStyle: this.modalFontStyle,
      textDecoration: this.modalTextDecoration,
      color: this.modalTextColor,
      pageNumber: index + 1
    };
    
    this.canvasElements.push(element);
  });

  this.currentPage = 1;
  this.drawCanvas();
  this.closeTextBodyModal();
  this.showStatus(`Text body added (${pages.length} page${pages.length > 1 ? 's' : ''})!`, 'success');
}


private splitTextIntoPages(
  text: string,
  boxWidth: number,
  boxHeight: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string
): string[] {
  const scaleFactor = this.canvasWidth / this.displayWidth;
  const actualFontSize = fontSize * scaleFactor;
  const lineHeight = actualFontSize * 1.4;
  const padding = 20 * scaleFactor;
  const maxWidth = boxWidth - (padding * 2);
  const maxLinesPerPage = Math.floor((boxHeight - padding * 2) / lineHeight);
  
  // Set font for measurement
  this.ctx.font = `${fontStyle} ${fontWeight} ${actualFontSize}px ${fontFamily}`;
  
  const pages: string[] = [];
  let currentPageLines: string[] = [];
  let currentLineCount = 0;
  
  const paragraphs = text.split('\n');
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    
    // Handle empty paragraphs (line breaks)
    if (paragraph.trim() === '') {
      if (currentLineCount < maxLinesPerPage) {
        currentPageLines.push('');
        currentLineCount++;
      } else {
        // Start new page
        pages.push(currentPageLines.join('\n'));
        currentPageLines = [''];
        currentLineCount = 1;
      }
      continue;
    }
    
    // Split paragraph into words and wrap
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (let j = 0; j < words.length; j++) {
      const word = words[j];
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        // Line is full, push it
        if (currentLineCount < maxLinesPerPage) {
          currentPageLines.push(currentLine);
          currentLineCount++;
        } else {
          // Page is full, start new page
          pages.push(currentPageLines.join('\n'));
          currentPageLines = [currentLine];
          currentLineCount = 1;
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    // Push remaining line
    if (currentLine) {
      if (currentLineCount < maxLinesPerPage) {
        currentPageLines.push(currentLine);
        currentLineCount++;
      } else {
        // Page is full, start new page
        pages.push(currentPageLines.join('\n'));
        currentPageLines = [currentLine];
        currentLineCount = 1;
      }
    }
  }
  
  // Push last page if it has content
  if (currentPageLines.length > 0) {
    pages.push(currentPageLines.join('\n'));
  }
  
  return pages;
}

private checkIfTextFits(element: CanvasElement): boolean {
  const scaleFactor = this.canvasWidth / this.displayWidth;
  const fontSize = element.fontSize! * scaleFactor;
  const lineHeight = fontSize * 1.4;
  const padding = 20 * scaleFactor;
  const maxWidth = element.width - 40 * scaleFactor;
  
  // Temporarily set font to measure
  this.ctx.font = `${element.fontStyle} ${element.fontWeight} ${fontSize}px ${element.fontFamily}`;
  
  let totalLines = 0;
  const paragraphs = element.text!.split('\n');
  
  paragraphs.forEach(paragraph => {
    if (paragraph.trim() === '') {
      totalLines++;
      return;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    words.forEach(word => {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        totalLines++;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    
    if (currentLine) totalLines++;
  });
  
  const totalHeight = totalLines * lineHeight + padding * 2;
  return totalHeight <= element.height;
}

private createMultiPageLayout(element: CanvasElement): void {
  // This will create a second canvas for overflow content
  // For now, we'll split the text and show a warning
  const scaleFactor = this.canvasWidth / this.displayWidth;
  const fontSize = element.fontSize! * scaleFactor;
  const lineHeight = fontSize * 1.4;
  const padding = 20 * scaleFactor;
  const maxWidth = element.width - 40 * scaleFactor;
  
  this.ctx.font = `${element.fontStyle} ${element.fontWeight} ${fontSize}px ${element.fontFamily}`;
  
  const maxLines = Math.floor((element.height - padding * 2) / lineHeight);
  const paragraphs = element.text!.split('\n');
  
  let lines: string[] = [];
  let currentLineCount = 0;
  let firstPageText = '';
  let secondPageText = '';
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      if (currentLineCount < maxLines) {
        firstPageText += '\n';
        currentLineCount++;
      } else {
        secondPageText += '\n';
      }
      continue;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        if (currentLineCount < maxLines) {
          firstPageText += currentLine + ' ';
          currentLineCount++;
        } else {
          secondPageText += currentLine + ' ';
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      if (currentLineCount < maxLines) {
        firstPageText += currentLine + '\n';
        currentLineCount++;
      } else {
        secondPageText += currentLine + '\n';
      }
    }
  }
  
  // Create first page element
  const firstPageElement: CanvasElement = {
    ...element,
    text: firstPageText.trim()
  };
  
  this.canvasElements.push(firstPageElement);
  
  if (secondPageText.trim()) {
    this.showStatus('Content spans multiple pages. Consider creating a second page manually or reducing content.', 'processing');
    console.log('Second page content:', secondPageText.trim());
  }
}

getTotalPages(): number {
  const pages = new Set<number>();
  this.canvasElements.forEach(el => {
    if (el.pageNumber) {
      pages.add(el.pageNumber);
    }
  });
  return Math.max(pages.size, 1);
}

previousPage(): void {
  if (this.currentPage > 1) {
    this.currentPage--;
    this.drawCanvas();
  }
}

nextPage(): void {
  const totalPages = this.getTotalPages();
  if (this.currentPage < totalPages) {
    this.currentPage++;
    this.drawCanvas();
  }
}


}



// functions and properties to remove in future 

// - onLetterBodyClick()
// - onLetterBodyChange()
// - handleWordDocument()
// - handleWordFile()
// - applyTemplate()
// - getTemplateText()
// - openEditModal()
// - closeEditModal()
// - confirmTextEdit()

// // REMOVE THESE PROPERTIES:
// - templates
// - selectedTemplate
// - showEditModal
// - editingText
// - editingElement
// - @ViewChild('fileInputLetter')