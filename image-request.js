function detectImageRequest(prompt, promptHistory = []) {
    const lower = (prompt || "").toLowerCase();
    const directKeywords = [
        "draw",
        "sketch",
        "illustrate",
        "render",
        "create an image",
        "generate an image",
        "show me",
        "picture of",
        "image of"
    ];
    const direct = directKeywords.some(kw => lower.includes(kw));
    const editKeywords = ["make", "change", "remove", "replace", "update", "edit"];
    const edit = promptHistory.length > 0 && editKeywords.some(kw => lower.includes(kw));
    return { isImageRequest: direct || edit, isDirect: direct, isEdit: edit };
}

function isImageRequest(prompt, promptHistory = []) {
    return detectImageRequest(prompt, promptHistory).isImageRequest;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectImageRequest, isImageRequest };
} else {
    window.detectImageRequest = detectImageRequest;
    window.isImageRequest = isImageRequest;
}
