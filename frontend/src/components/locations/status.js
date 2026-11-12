// What each preview status means, and its badge colour.
//   new        not in Aarogya Drishti yet          -> will be added
//   update     same LGD code, LGD name changed     -> name will be updated
//   link       same name, typed in by hand earlier -> LGD code will be attached (id kept)
//   unchanged  already imported, nothing to do
//   protected  marked verified by an admin         -> never changed
//   conflict   LGD code saved under another parent -> needs a manual check
export const STATUS_TONES = {
  new: "success",
  update: "warning",
  link: "info",
  unchanged: "neutral",
  protected: "brand",
  conflict: "danger",
};

export const STATUS_ORDER = ["new", "update", "link", "unchanged", "protected", "conflict"];

// Only these can be selected for import
export const IMPORTABLE = ["new", "update", "link"];
