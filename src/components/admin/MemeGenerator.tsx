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

interface TextLine {
  text: string;
  verticalPosition: number;
  fontSize: number;
  fontFamily: string;
  isBold: boolean;
}

interface MemeGeneratorProps {
  wrapPreview?: (node: React.ReactNode) => React.ReactNode;
}

const CANVAS_SIZE = 1080;
const DEFAULT_BG_COLOR = '#1D4ED8';

const FONT_FAMILIES = [
  { value: 'Inter', label: 'Inter' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
  { value: 'Bricolage Grotesque', label: 'Bricolage Grotesque' },
  { value: 'IBM Plex Sans', label: 'IBM Plex Sans' },
  { value: 'IBM Plex Mono', label: 'IBM Plex Mono' },
  { value: 'Atkinson Hyperlegible', label: 'Atkinson Hyperlegible' },
];

const DEFAULT_TEXT_LINES: TextLine[] = [
  { text: '', verticalPosition: 25, fontSize: 48, fontFamily: 'Inter', isBold: false },
  { text: '', verticalPosition: 50, fontSize: 48, fontFamily: 'Inter', isBold: false },
  { text: '', verticalPosition: 75, fontSize: 48, fontFamily: 'Inter', isBold: false },
];

const inputClasses = "w-full px-3 py-2 border border-brand-frosted-steel dark:border-gray-600 rounded-md bg-brand-glacier-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-cloud-blue dark:focus:ring-blue-500";
const labelClasses = "block text-sm font-medium text-brand-slate-gray dark:text-gray-300 mb-2";
const panelClasses = "bg-white dark:bg-gray-800 p-6 rounded-lg border border-brand-frosted-steel dark:border-gray-700";
const buttonActiveClasses = 'border-brand-cloud-blue bg-brand-cloud-blue/10 text-brand-cloud-blue dark:border-blue-500 dark:bg-blue-500/20 dark:text-blue-400';
const buttonInactiveClasses = 'border-brand-frosted-steel dark:border-gray-600 text-brand-slate-gray dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';

function RangeSlider({
  id,
  label,
  value,
  onChange,
  min,
  max,
  icon: Icon,
  suffix = ''
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  icon?: React.ElementType;
  suffix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
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
}

function ToggleButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-lg border transition-colors ${
        active ? buttonActiveClasses : buttonInactiveClasses
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

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

  const clearBackgroundImage = () => {
    setBackgroundImage(null);
    setBackgroundImageUrl(null);
    imageRef.current = null;
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

  const getFontString = (fontFamily: string, fontSize: number, isBold: boolean) => {
    const weight = isBold ? 'bold' : 'normal';
    return `${weight} ${fontSize}px "${fontFamily}", sans-serif`;
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

      ctx.font = getFontString(line.fontFamily, line.fontSize, line.isBold);
      ctx.fillStyle = 'white';
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
        <div className={panelClasses}>
          <div className="flex items-center gap-2 mb-4">
            <PhotoIcon className="w-5 h-5 text-brand-slate-gray dark:text-gray-300" />
            <h3 className="text-lg font-semibold font-space-grotesk text-brand-slate-gray dark:text-gray-200">
              Background & Logo
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="backgroundColor" className={labelClasses}>
                Background Color
              </label>
              <input
                type="color"
                id="backgroundColor"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="w-full h-10 rounded border border-brand-frosted-steel dark:border-gray-600 cursor-pointer"
              />
            </div>

            <div>
              <label htmlFor="backgroundImage" className={labelClasses}>
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
                  onClick={clearBackgroundImage}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700"
                  aria-label="Clear background image"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Clear
                </button>
              </div>
            )}

            <RangeSlider
              id="logoSize"
              label="Logo Size"
              value={logoSize}
              onChange={setLogoSize}
              min={60}
              max={300}
              icon={ArrowsPointingOutIcon}
              suffix="px"
            />

            <RangeSlider
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
              <label className={labelClasses}>Logo Style</label>
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
          <div key={index} className={panelClasses}>
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
                  <label htmlFor={`text-${index}`} className={labelClasses}>
                    Text Content
                  </label>
                  <input
                    type="text"
                    id={`text-${index}`}
                    value={line.text}
                    onChange={(e) => updateTextLine(index, 'text', e.target.value)}
                    className={inputClasses}
                    placeholder="Enter your text..."
                  />
                </div>

                <RangeSlider
                  id={`position-${index}`}
                  label="Vertical Position"
                  value={line.verticalPosition}
                  onChange={(value) => updateTextLine(index, 'verticalPosition', value)}
                  min={0}
                  max={100}
                  icon={AdjustmentsHorizontalIcon}
                  suffix="%"
                />

                <RangeSlider
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
                  <label htmlFor={`fontFamily-${index}`} className={labelClasses}>
                    Font Family
                  </label>
                  <select
                    id={`fontFamily-${index}`}
                    value={line.fontFamily}
                    onChange={(e) => updateTextLine(index, 'fontFamily', e.target.value)}
                    className={inputClasses}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

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
            )}
          </div>
        ))}
      </div>
    </div>
  );
}