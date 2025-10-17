'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  PhotoIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  AdjustmentsHorizontalIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';
import { Logo } from '../Logo';
import {
  CANVAS_SIZE,
  DEFAULT_BG_COLOR,
  BRAND_COLORS,
  TEXT_COLOR_PRESETS,
  FONT_FAMILIES,
  DEFAULT_TEXT_LINES,
  styles,
  type TextLine
} from './meme-generator-config';

interface MemeGeneratorProps {
  wrapPreview?: (node: React.ReactNode) => React.ReactNode;
}

interface ColorButtonProps {
  color: { name: string; value: string };
  onClick: () => void;
  isActive?: boolean;
  size?: 'small' | 'large';
}

interface SliderProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
  icon?: React.ElementType;
}

const ColorButton = ({ color, onClick, isActive, size = 'large' }: ColorButtonProps) => {
  if (size === 'small') {
    return (
      <button
        onClick={onClick}
        className="w-8 h-8 rounded-md border-2 border-gray-300 dark:border-gray-600 hover:border-brand-cloud-blue dark:hover:border-blue-400 transition-colors shadow-sm"
        style={{ backgroundColor: color.value }}
        title={color.name}
        aria-label={`Set color to ${color.name}`}
      />
    );
  }

  return (
    <button
      onClick={onClick}
      className={`relative group flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all ${
        isActive
          ? 'border-brand-cloud-blue dark:border-blue-400 shadow-md'
          : 'border-brand-frosted-steel dark:border-gray-600 hover:border-brand-cloud-blue/50 dark:hover:border-blue-500/50'
      }`}
      title={color.name}
    >
      <div
        className="w-12 h-12 rounded-md shadow-sm border border-gray-300 dark:border-gray-600"
        style={{ backgroundColor: color.value }}
      />
      <span className="text-xs text-brand-slate-gray dark:text-gray-300 font-medium">
        {color.name}
      </span>
      {isActive && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-brand-cloud-blue dark:bg-blue-400 rounded-full" />
      )}
    </button>
  );
};

const Slider = ({ id, label, value, onChange, min, max, suffix = '', icon: Icon }: SliderProps) => (
  <div>
    <label htmlFor={id} className={styles.label}>
      {Icon && <Icon className="inline w-4 h-4 mr-1" />}
      {label}: {Math.round(value)}{suffix}
    </label>
    <input
      type="range"
      id={id}
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full slider"
    />
  </div>
);

const ToggleButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${
      active ? styles.buttonActive : styles.buttonInactive
    }`}
    aria-pressed={active}
  >
    {children}
  </button>
);

export function MemeGenerator({ wrapPreview }: MemeGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BG_COLOR);
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [textLines, setTextLines] = useState<TextLine[]>(DEFAULT_TEXT_LINES);
  const [logoSize, setLogoSize] = useState(120);
  const [logoVerticalPosition, setLogoVerticalPosition] = useState(20);
  const [logoVariant, setLogoVariant] = useState<'gradient' | 'monochrome'>('gradient');
  const [expandedSections, setExpandedSections] = useState<boolean[]>([true, false, false]);

  const getMonochromeColor = useCallback(() => {
    if (backgroundImageUrl) return '#FFFFFF';
    const hex = backgroundColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }, [backgroundColor, backgroundImageUrl]);

  const handleBackgroundImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setBackgroundImage(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        setBackgroundImageUrl(url);
        const img = new window.Image();
        img.onload = () => {
          imageRef.current = img;
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }
  };

  const updateTextLine = (index: number, property: keyof TextLine, value: string | number | boolean) => {
    setTextLines(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [property]: value };
      return updated;
    });
  };

  const toggleSection = (index: number) => {
    setExpandedSections(prev => {
      const updated = [...prev];
      updated[index] = !updated[index];
      return updated;
    });
  };

  const drawCanvas = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (imageRef.current && backgroundImageUrl) {
      const img = imageRef.current;
      const hRatio = CANVAS_SIZE / img.width;
      const vRatio = CANVAS_SIZE / img.height;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (CANVAS_SIZE - img.width * ratio) / 2;
      const centerShiftY = (CANVAS_SIZE - img.height * ratio) / 2;

      ctx.drawImage(
        img,
        0, 0, img.width, img.height,
        centerShiftX, centerShiftY,
        img.width * ratio,
        img.height * ratio
      );
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    }

    textLines.forEach((line) => {
      if (!line.text) return;

      const weight = line.isBold ? 'bold' : 'normal';
      ctx.font = `${weight} ${line.fontSize}px "${line.fontFamily}", sans-serif`;
      ctx.fillStyle = line.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      const x = CANVAS_SIZE / 2;
      const y = (line.verticalPosition / 100) * CANVAS_SIZE;
      ctx.fillText(line.text, x, y);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });
  }, [backgroundColor, backgroundImageUrl, textLines]);

  const draw = useCallback(() => {
    [canvasRef.current, exportCanvasRef.current]
      .filter(Boolean)
      .forEach(canvas => {
        const ctx = canvas?.getContext('2d');
        if (ctx) drawCanvas(ctx);
      });
  }, [drawCanvas]);

  useEffect(() => {
    draw();
  }, [draw]);

  const logoStyle = logoVariant === 'monochrome' ? { color: getMonochromeColor() } : undefined;

  const renderLogo = (scale: number = 1) => (
    <div
      className={scale === 1 ? "absolute" : "absolute right-2"}
      style={{
        bottom: `${logoVerticalPosition * scale}px`,
        right: scale === 1 ? '40px' : undefined,
        width: `${logoSize * scale}px`,
        height: `${logoSize * scale}px`
      }}
    >
      <Logo variant={logoVariant} className="w-full h-full" style={logoStyle} />
    </div>
  );

  const previewNode = (
    <div className="relative w-[540px] h-[540px] max-w-full mx-auto overflow-hidden rounded-lg shadow-lg">
      <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="w-full h-full" />
      {renderLogo(0.5)}
    </div>
  );

  const exportNode = wrapPreview && (
    <div className="hidden">
      {wrapPreview(
        <div className="relative w-[1080px] h-[1080px]">
          <canvas ref={exportCanvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className="w-full h-full" />
          {renderLogo(1)}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold font-space-grotesk text-brand-slate-gray dark:text-gray-200">
          Preview
        </h3>
        {wrapPreview ? wrapPreview(previewNode) : previewNode}
        {exportNode}
      </div>

      <div className="space-y-6">
        <div className={styles.panel}>
          <div className="flex items-center gap-2 mb-4">
            <PhotoIcon className="w-5 h-5 text-brand-slate-gray dark:text-gray-300" />
            <h3 className="text-lg font-semibold font-space-grotesk text-brand-slate-gray dark:text-gray-200">
              Background & Logo
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className={styles.label}>Color Presets</label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {BRAND_COLORS.map((color) => (
                  <ColorButton
                    key={color.value}
                    color={color}
                    isActive={backgroundColor === color.value}
                    onClick={() => setBackgroundColor(color.value)}
                  />
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="backgroundColor" className={styles.label}>Custom Color</label>
              <input
                type="color"
                id="backgroundColor"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-full h-10 rounded border border-brand-frosted-steel dark:border-gray-600 cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="backgroundImage" className={styles.label}>
                <ArrowUpTrayIcon className="inline w-4 h-4 mr-1" />
                Upload Background Image
              </label>
              <input
                type="file"
                id="backgroundImage"
                accept="image/*"
                onChange={handleBackgroundImageUpload}
                className="w-full text-sm text-brand-slate-gray dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-brand-cloud-blue file:text-white hover:file:bg-brand-cloud-blue/90 dark:file:bg-blue-600 dark:hover:file:bg-blue-700"
              />
            </div>

            {backgroundImage && (
              <div className="flex items-center gap-4">
                <p className="text-sm text-brand-slate-gray dark:text-gray-300 flex-1">
                  Current: {backgroundImage.name}
                </p>
                <button
                  onClick={() => {
                    setBackgroundImage(null);
                    setBackgroundImageUrl(null);
                    imageRef.current = null;
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  aria-label="Clear background image"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Clear
                </button>
              </div>
            )}

            <Slider
              id="logoSize"
              label="Logo Size"
              value={logoSize}
              onChange={setLogoSize}
              min={60}
              max={300}
              icon={ArrowsPointingOutIcon}
              suffix="px"
            />

            <Slider
              id="logoVerticalPosition"
              label="Logo Distance from Bottom"
              value={logoVerticalPosition}
              onChange={setLogoVerticalPosition}
              min={-100}
              max={500}
              icon={AdjustmentsHorizontalIcon}
              suffix="px"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              Negative values move logo below the bottom edge
            </p>

            <div>
              <label className={styles.label}>Logo Style</label>
              <div className="flex gap-3">
                <ToggleButton
                  active={logoVariant === 'gradient'}
                  onClick={() => setLogoVariant('gradient')}
                >
                  Gradient (Color)
                </ToggleButton>
                <ToggleButton
                  active={logoVariant === 'monochrome'}
                  onClick={() => setLogoVariant('monochrome')}
                >
                  Monochrome (B&W)
                </ToggleButton>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Monochrome adapts to light/dark backgrounds automatically
              </p>
            </div>
          </div>
        </div>

        {textLines.map((line, index) => (
          <div key={index} className={styles.panel}>
            <button
              onClick={() => toggleSection(index)}
              className="w-full flex items-center justify-between mb-4"
              aria-expanded={expandedSections[index]}
            >
              <h3 className="text-lg font-semibold font-space-grotesk text-brand-slate-gray dark:text-gray-200">
                Text Line {index + 1}
              </h3>
              {expandedSections[index] ? (
                <ChevronUpIcon className="w-5 h-5 text-brand-slate-gray dark:text-gray-300" />
              ) : (
                <ChevronDownIcon className="w-5 h-5 text-brand-slate-gray dark:text-gray-300" />
              )}
            </button>

            {expandedSections[index] && (
              <div className="space-y-4">
                <div>
                  <label htmlFor={`text-${index}`} className={styles.label}>Text Content</label>
                  <input
                    type="text"
                    id={`text-${index}`}
                    value={line.text}
                    onChange={(e) => updateTextLine(index, 'text', e.target.value)}
                    className={styles.input}
                    placeholder="Enter your text..."
                  />
                </div>

                <Slider
                  id={`position-${index}`}
                  label="Vertical Position"
                  value={line.verticalPosition}
                  onChange={(value) => updateTextLine(index, 'verticalPosition', value)}
                  min={0}
                  max={100}
                  icon={AdjustmentsHorizontalIcon}
                  suffix="%"
                />

                <Slider
                  id={`fontSize-${index}`}
                  label="Font Size"
                  value={line.fontSize}
                  onChange={(value) => updateTextLine(index, 'fontSize', value)}
                  min={16}
                  max={120}
                  icon={ArrowsPointingOutIcon}
                  suffix="px"
                />

                <div>
                  <label htmlFor={`fontFamily-${index}`} className={styles.label}>Font Family</label>
                  <select
                    id={`fontFamily-${index}`}
                    value={line.fontFamily}
                    onChange={(e) => updateTextLine(index, 'fontFamily', e.target.value)}
                    className={styles.input}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label htmlFor={`color-${index}`} className={styles.label}>Text Color</label>
                    <div className="flex gap-2 mb-2">
                      {TEXT_COLOR_PRESETS.map((preset) => (
                        <ColorButton
                          key={preset.value}
                          color={preset}
                          size="small"
                          onClick={() => updateTextLine(index, 'color', preset.value)}
                        />
                      ))}
                    </div>
                    <input
                      type="color"
                      id={`color-${index}`}
                      value={line.color}
                      onChange={(e) => updateTextLine(index, 'color', e.target.value)}
                      className="w-full h-10 rounded border border-brand-frosted-steel dark:border-gray-600 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-end pb-2">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={`bold-${index}`}
                        checked={line.isBold}
                        onChange={(e) => updateTextLine(index, 'isBold', e.target.checked)}
                        className="w-4 h-4 text-brand-cloud-blue dark:text-blue-400 bg-brand-glacier-white dark:bg-gray-700 border-brand-frosted-steel dark:border-gray-600 rounded focus:ring-brand-cloud-blue dark:focus:ring-blue-500"
                      />
                      <label htmlFor={`bold-${index}`} className="ml-2 text-sm font-medium text-brand-slate-gray dark:text-gray-300">
                        Bold
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}