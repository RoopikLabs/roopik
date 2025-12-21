export const isValidUrl = (urlString) => {
    try {
        new URL(urlString);
        return true;
    }
    catch {
        return false;
    }
};
//# sourceMappingURL=url.js.map