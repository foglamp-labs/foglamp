/**
 * Build a favicon URL for a domain/site using Google's favicon service.
 * Accepts either a bare domain ("example.com") or a full URL; missing schemes
 * are prefixed with https://. Returns a 256px icon URL.
 */
export const getGoogleFavicon = (domain: string) => {
	if (domain.includes("https://") || domain.includes("http://")) {
		return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${domain}&size=256`;
	} else {
		return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`;
	}
};
