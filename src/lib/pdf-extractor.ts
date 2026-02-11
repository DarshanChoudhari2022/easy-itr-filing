/**
 * PDF Text Extractor
 * Extracts text content from PDF files using pdf.js
 * Used for Form 16, AIS, and other tax document parsing
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;

export interface PDFExtractionResult {
    text: string;
    pages: number;
    metadata?: {
        title?: string;
        author?: string;
        subject?: string;
        creator?: string;
    };
    isImageBased: boolean;
    warnings: string[];
}

/**
 * Extract text content from a PDF file
 * @param file - The PDF File object from input[type=file]
 * @returns Extracted text, page count, and metadata
 */
export async function extractTextFromPDF(file: File): Promise<PDFExtractionResult> {
    const warnings: string[] = [];

    try {
        // Validate file type
        if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
            throw new Error('Invalid file type. Please upload a PDF file.');
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            throw new Error('File size exceeds 10MB limit. Please upload a smaller file.');
        }

        const arrayBuffer = await file.arrayBuffer();

        // Try loading PDF (handle password-protected files)
        let pdf: pdfjsLib.PDFDocumentProxy;
        try {
            pdf = await pdfjsLib.getDocument({
                data: arrayBuffer,
                useSystemFonts: true
            }).promise;
        } catch (loadError: any) {
            if (loadError?.name === 'PasswordException') {
                throw new Error('This PDF is password-protected. Please remove the password and try again.');
            }
            throw new Error('Unable to read this PDF file. It may be corrupted.');
        }

        let fullText = '';
        let totalCharCount = 0;
        const pageTexts: string[] = [];

        // Extract text from each page
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();

            const pageText = content.items
                .map((item: any) => {
                    // Handle text items with positioning
                    if (item.str !== undefined) {
                        return item.str;
                    }
                    return '';
                })
                .join(' ');

            pageTexts.push(pageText);
            totalCharCount += pageText.replace(/\s/g, '').length;
            fullText += pageText + '\n\n--- Page Break ---\n\n';
        }

        // Clean up the extracted text
        fullText = cleanExtractedText(fullText);

        // Check if it's an image-based PDF (very little text extracted)
        const isImageBased = totalCharCount < 50 && pdf.numPages > 0;

        if (isImageBased) {
            warnings.push(
                'This PDF appears to be a scanned/image-based document. ' +
                'Text extraction may be incomplete. Please verify the extracted data or enter details manually.'
            );
        }

        // Get metadata
        let metadata: PDFExtractionResult['metadata'] = {};
        try {
            const metaObj = await pdf.getMetadata();
            const info = metaObj?.info as any;
            if (info) {
                metadata = {
                    title: info.Title || undefined,
                    author: info.Author || undefined,
                    subject: info.Subject || undefined,
                    creator: info.Creator || undefined,
                };
            }
        } catch {
            // Metadata extraction is optional
        }

        return {
            text: fullText.trim(),
            pages: pdf.numPages,
            metadata,
            isImageBased,
            warnings,
        };

    } catch (error: any) {
        throw new Error(error.message || 'Failed to extract text from PDF. Please try again.');
    }
}

/**
 * Clean up extracted text for better parsing
 */
function cleanExtractedText(text: string): string {
    return text
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Fix common OCR/extraction issues
        .replace(/\u00A0/g, ' ')  // Non-breaking spaces
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
        // Fix comma-separated numbers that got split
        .replace(/(\d),\s+(\d)/g, '$1,$2')
        // Fix amounts that got split (e.g., "1,50, 000" → "1,50,000")
        .replace(/(\d),(\d{2}),\s+(\d{3})/g, '$1,$2,$3')
        // Normalize line endings
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Remove excessive newlines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Detect if the PDF is likely a Form 16
 */
export function isLikelyForm16(text: string): boolean {
    const indicators = [
        'form no. 16',
        'form 16',
        'certificate under section 203',
        'tax deducted at source',
        'part a',
        'part b',
        'gross salary',
        'employer',
        'assessment year',
    ];

    const lowerText = text.toLowerCase();
    const matchCount = indicators.filter(indicator => lowerText.includes(indicator)).length;

    return matchCount >= 3;
}

/**
 * Detect if the PDF is likely an AIS document
 */
export function isLikelyAIS(text: string): boolean {
    const indicators = [
        'annual information statement',
        'ais',
        'taxpayer information summary',
        'tis',
        'sft',
        'specified financial transaction',
        'information source',
    ];

    const lowerText = text.toLowerCase();
    const matchCount = indicators.filter(indicator => lowerText.includes(indicator)).length;

    return matchCount >= 2;
}

/**
 * Detect the type of tax document from PDF content
 */
export function detectDocumentType(text: string): 'form16' | 'ais' | '26as' | 'unknown' {
    if (isLikelyForm16(text)) return 'form16';
    if (isLikelyAIS(text)) return 'ais';

    const lowerText = text.toLowerCase();
    if (lowerText.includes('form 26as') || lowerText.includes('tax credit statement') ||
        lowerText.includes('annual tax statement')) {
        return '26as';
    }

    return 'unknown';
}
