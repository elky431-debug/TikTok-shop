export declare const DEFAULT_IMAGE_HOSTS: string[];
export declare function imageHostPatterns(): string[];
export declare function isAllowedImageHost(host: string, patterns?: string[]): boolean;
export declare function remotePatterns(): Array<{ protocol: 'https'; hostname: string }>;
