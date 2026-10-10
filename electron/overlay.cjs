const shouldHide=(settings,fullscreen,pinned)=>Boolean(fullscreen&&settings.hideFullscreen&&!(settings.gamingOverlay&&pinned));
module.exports={shouldHide};
