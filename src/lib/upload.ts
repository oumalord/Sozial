export interface Prepared {
    name: string;
    mime: string;
    data: string;
    width: number | null;
    height: number | null;
    duration: number | null;
}

export const MAX_BYTES = 3200000;
export const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime';

function readDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error('Could not read ' + file.name));
        r.readAsDataURL(file);
    });
}

function measure(file: File, url: string): Promise<{ width: number | null; height: number | null; duration: number | null }> {
    return new Promise((resolve) => {
        const none = { width: null, height: null, duration: null };
        const timer = setTimeout(() => resolve(none), 4000);
        if (file.type.startsWith('image/')) {
            const img = new Image();
            img.onload = () => {
                clearTimeout(timer);
                resolve({ width: img.naturalWidth, height: img.naturalHeight, duration: null });
            };
            img.onerror = () => {
                clearTimeout(timer);
                resolve(none);
            };
            img.src = url;
        } else {
            const v = document.createElement('video');
            v.preload = 'metadata';
            v.onloadedmetadata = () => {
                clearTimeout(timer);
                resolve({ width: v.videoWidth, height: v.videoHeight, duration: Math.round(v.duration) });
                URL.revokeObjectURL(v.src);
            };
            v.onerror = () => {
                clearTimeout(timer);
                resolve(none);
            };
            v.src = URL.createObjectURL(file);
        }
    });
}

export async function prepareFile(file: File): Promise<Prepared> {
    if (file.size > MAX_BYTES) throw new Error(file.name + ' is larger than 3.5 MB. Use Add by URL for bigger files.');
    const dataUrl = await readDataUrl(file);
    const meta = await measure(file, dataUrl);
    const comma = dataUrl.indexOf(',');
    return { name: file.name, mime: file.type, data: dataUrl.slice(comma + 1), ...meta };
}
