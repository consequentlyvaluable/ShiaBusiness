let supabaseClient;
let businesses = [];
let lastQuery = "";

const businessListEl = document.querySelector("#businessList");
const emptyStateEl = document.querySelector("#emptyState");
const statusMessageEl = document.querySelector("#statusMessage");
const searchInputEl = document.querySelector("#searchInput");
const formSectionEl = document.querySelector("#formSection");
const toggleFormButton = document.querySelector("#toggleFormButton");
const cancelButton = document.querySelector("#cancelButton");
const businessForm = document.querySelector("#businessForm");
const submitButton = businessForm.querySelector('[type="submit"]');
const categoryOptionsList = document.querySelector("#categoryOptions");
const copyrightYearEl = document.querySelector("#copyrightYear");
const businessCountEl = document.querySelector("#businessCount");
const categoryCountEl = document.querySelector("#categoryCount");
const locationInput = businessForm?.querySelector('input[name="location"]');
const nameInput = businessForm?.querySelector('input[name="name"]');

let activePopover;
let activeAnchor;
let pageOverlay;

let googleMapsLoadedPromise;
let locationAutocomplete;

const loadGoogleMapsPlaces = () => {
  if (typeof window === "undefined") return Promise.resolve(null);

  if (window.google?.maps?.places) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsLoadedPromise) {
    return googleMapsLoadedPromise;
  }

  const config = window.googleMapsConfig ?? {};
  const apiKey = config.apiKey?.trim();
  const isPlaceholder = apiKey && /YOUR_GOOGLE_MAPS_API_KEY/i.test(apiKey);

  if (!apiKey || isPlaceholder) {
    return Promise.resolve(null);
  }

  googleMapsLoadedPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places",
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error("Google Maps did not load as expected."));
      }
    };
    script.onerror = () => {
      reject(new Error("Failed to load the Google Maps script."));
    };

    document.head.append(script);
  })
    .catch((error) => {
      console.error(error);
      googleMapsLoadedPromise = null;
      return null;
    });

  return googleMapsLoadedPromise;
};

const setupLocationAutocomplete = async () => {
  if (!locationInput) return;
  if (locationAutocomplete) return;

  try {
    const maps = await loadGoogleMapsPlaces();

    if (!maps?.places) return;

    locationAutocomplete = new maps.places.Autocomplete(locationInput, {
      fields: ["formatted_address", "name"],
    });

    locationAutocomplete.addListener("place_changed", () => {
      const place = locationAutocomplete.getPlace();
      if (!place) return;

      if (place.formatted_address) {
        locationInput.value = place.formatted_address;
      }

      if (place.name && nameInput && !nameInput.value.trim()) {
        nameInput.value = place.name;
      }
    });
  } catch (error) {
    console.error("Unable to initialise Google Maps autocomplete", error);
  }
};

const setStatusMessage = (message, { variant } = {}) => {
  if (!message) {
    statusMessageEl.hidden = true;
    statusMessageEl.textContent = "";
    delete statusMessageEl.dataset.variant;
    return;
  }

  statusMessageEl.hidden = false;
  statusMessageEl.textContent = message;

  if (variant) {
    statusMessageEl.dataset.variant = variant;
  } else {
    delete statusMessageEl.dataset.variant;
  }
};

const getUniqueCategories = () => {
  const seen = new Set();
  const options = [];

  businesses.forEach(({ category }) => {
    const value = category?.trim();
    if (!value) return;

    const key = value.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    options.push(value);
  });

  return options.sort((first, second) => first.localeCompare(second));
};

const updateDirectoryStats = () => {
  if (businessCountEl) {
    businessCountEl.textContent = businesses.length.toLocaleString();
  }

  if (categoryCountEl) {
    categoryCountEl.textContent = getUniqueCategories().length.toLocaleString();
  }
};

const updateCategoryOptions = () => {
  if (!categoryOptionsList) return;

  const options = getUniqueCategories();

  categoryOptionsList.innerHTML = "";

  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    categoryOptionsList.append(option);
  });
};

const renderBusinesses = (items) => {
  updateDirectoryStats();
  closePopover();
  businessListEl.innerHTML = "";

  if (items.length === 0) {
    emptyStateEl.hidden = false;
    businessListEl.setAttribute("aria-live", "polite");
    return;
  }

  emptyStateEl.hidden = true;

  const fragment = document.createDocumentFragment();

  items.forEach((business) => {
    const card = document.createElement("article");
    card.className = "business";
    card.setAttribute("role", "listitem");
    card.setAttribute("tabindex", "0");
    card.dataset.id = business.id;

    const title = document.createElement("h3");
    title.className = "business__name";
    title.textContent = business.name;

    const meta = document.createElement("div");
    meta.className = "business__meta";

    const categoryBadge = document.createElement("span");
    categoryBadge.className = "badge";
    categoryBadge.textContent = business.category;

    const locationBadge = document.createElement("span");
    locationBadge.className = "badge";
    locationBadge.textContent = business.location;

    const description = document.createElement("p");
    description.className = "business__description";
    description.textContent = business.description || "No description provided.";

    meta.append(categoryBadge, locationBadge);
    card.append(title, meta, description);
    fragment.append(card);
  });

  businessListEl.append(fragment);
};

const ensurePageOverlay = () => {
  if (pageOverlay) return pageOverlay;

  const overlay = document.createElement("div");
  overlay.className = "page-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.addEventListener("click", () => {
    closePopover();
  });

  document.body.append(overlay);
  pageOverlay = overlay;
  return overlay;
};

const ensurePopover = () => {
  if (activePopover) return activePopover;

  const popover = document.createElement("section");
  popover.className = "business-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-live", "polite");

  const arrow = document.createElement("div");
  arrow.className = "business-popover__arrow";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "business-popover__close";
  closeButton.setAttribute("aria-label", "Close details");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    closePopover();
    activeAnchor?.focus();
  });

  const title = document.createElement("h3");
  title.className = "business-popover__title";

  const meta = document.createElement("div");
  meta.className = "business-popover__meta";

  const description = document.createElement("p");
  description.className = "business-popover__description";

  popover.append(arrow, closeButton, title, meta, description);
  document.body.append(popover);

  activePopover = popover;
  return popover;
};

const closePopover = () => {
  if (!activePopover) return;
  activePopover.removeAttribute("data-open");
  activePopover.style.top = "";
  activePopover.style.left = "";
  activePopover.style.removeProperty("--arrow-left");
  activePopover.dataset.mode = "";
  activeAnchor?.removeAttribute("aria-expanded");
  activeAnchor = null;
  pageOverlay?.removeAttribute("data-open");
  document.removeEventListener("click", handleOutsideClick, true);
  window.removeEventListener("resize", handleViewportChange);
  window.removeEventListener("scroll", handleViewportChange, true);
  document.removeEventListener("keydown", handlePopoverKeydown);
};

const positionPopover = () => {
  if (!activePopover) return;

  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  activePopover.dataset.mode = "centered";
  activePopover.style.position = "fixed";
  activePopover.style.left = "50%";
  activePopover.style.top = "50%";
  activePopover.style.transform = "translate(-50%, -50%)";
  activePopover.style.setProperty(
    "max-height",
    `${Math.max(360, viewportHeight - 48)}px`
  );
  activePopover.style.setProperty(
    "max-width",
    `${Math.min(640, viewportWidth - 40)}px`
  );
  activePopover.style.setProperty("--arrow-left", "");
};

const handleOutsideClick = (event) => {
  if (!activePopover || !activeAnchor) return;
  if (activePopover.contains(event.target) || activeAnchor.contains(event.target)) return;
  closePopover();
};

const handleViewportChange = () => {
  if (activePopover && activeAnchor) {
    positionPopover();
  }
};

const handlePopoverKeydown = (event) => {
  if (event.key === "Escape") {
    closePopover();
  }
};

const openPopover = (business, anchor) => {
  const popover = ensurePopover();
  const overlay = ensurePageOverlay();

  const [titleEl, metaEl, descriptionEl] = [
    popover.querySelector(".business-popover__title"),
    popover.querySelector(".business-popover__meta"),
    popover.querySelector(".business-popover__description"),
  ];

  titleEl.textContent = business.name;
  metaEl.innerHTML = "";

  const category = document.createElement("span");
  category.className = "badge";
  category.textContent = business.category;

  const location = document.createElement("span");
  location.className = "badge";
  location.textContent = business.location;

  metaEl.append(category, location);

  descriptionEl.textContent = business.description || "No description provided.";

  overlay.setAttribute("data-open", "true");
  popover.setAttribute("data-open", "true");
  activeAnchor?.removeAttribute("aria-expanded");
  activeAnchor = anchor;
  activeAnchor.setAttribute("aria-expanded", "true");

  positionPopover();

  document.addEventListener("click", handleOutsideClick, true);
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("scroll", handleViewportChange, true);
  document.addEventListener("keydown", handlePopoverKeydown);
};

const handleBusinessActivation = (card) => {
  const businessId = card.dataset.id;
  const business = businesses.find((item) => `${item.id}` === `${businessId}`);

  if (!business) return;

  if (activeAnchor === card) {
    closePopover();
    return;
  }

  openPopover(business, card);
};

const handleBusinessClick = (event) => {
  const card = event.target.closest(".business");
  if (!card || !businessListEl.contains(card)) return;
  handleBusinessActivation(card);
};

const handleBusinessKeydown = (event) => {
  const card = event.target.closest(".business");
  if (!card || !businessListEl.contains(card)) return;

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleBusinessActivation(card);
  }
};

const filterBusinesses = (query) => {
  lastQuery = query;
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    renderBusinesses(businesses);
    return;
  }

  // For larger datasets consider issuing a filtered query to Supabase instead of client-side filtering.
  const filtered = businesses.filter(({ name, category, location, description }) => {
    const haystack = [name, category, location, description].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  renderBusinesses(filtered);
};

const loadBusinesses = async () => {
  setStatusMessage("Loading businesses…");
  businessListEl.setAttribute("aria-busy", "true");
  emptyStateEl.hidden = true;

  const { data, error } = await supabaseClient
    .from("businesses")
    .select("id, name, category, location, description");

  businessListEl.removeAttribute("aria-busy");

  if (error) {
    businesses = [];
    renderBusinesses([]);
    setStatusMessage(`Unable to load businesses: ${error.message}`, {
      variant: "error",
    });
    updateCategoryOptions();
    return;
  }

  businesses = data ?? [];
  updateCategoryOptions();
  setStatusMessage("");

  if (!lastQuery) {
    renderBusinesses(businesses);
  } else {
    filterBusinesses(lastQuery);
  }
};

const scrollToFormSection = () => {
  formSectionEl.scrollIntoView({ behavior: "smooth", block: "start" });
};

const toggleFormVisibility = (show, { shouldNavigate = false } = {}) => {
  const shouldShow = typeof show === "boolean" ? show : formSectionEl.classList.contains("form--hidden");

  if (shouldShow) {
    formSectionEl.classList.remove("form--hidden");
    formSectionEl.setAttribute("aria-hidden", "false");
    toggleFormButton.setAttribute("aria-expanded", "true");

    if (shouldNavigate) {
      requestAnimationFrame(scrollToFormSection);
    }
  } else {
    formSectionEl.classList.add("form--hidden");
    formSectionEl.setAttribute("aria-hidden", "true");
    toggleFormButton.setAttribute("aria-expanded", "false");
  }
};

const handleFormSubmit = async (event) => {
  event.preventDefault();

  const formData = new FormData(businessForm);
  const entry = Object.fromEntries(formData.entries());

  if (!entry.name || !entry.category || !entry.location) {
    alert("Please fill in the required fields: name, category, and location.");
    return;
  }

  if (!supabaseClient) {
    setStatusMessage("Supabase client is not configured. Please check your settings.", {
      variant: "error",
    });
    return;
  }

  entry.name = entry.name.trim();
  entry.category = entry.category.trim();
  entry.location = entry.location.trim();
  entry.description = entry.description?.trim() || null;

  submitButton.disabled = true;
  setStatusMessage("Saving business…");

  const { data, error } = await supabaseClient
    .from("businesses")
    .insert([entry])
    .select()
    .single();

  submitButton.disabled = false;

  if (error) {
    setStatusMessage(`Unable to save business: ${error.message}`, {
      variant: "error",
    });
    return;
  }

  if (data) {
    businesses = [data, ...businesses];
    updateCategoryOptions();
    filterBusinesses(lastQuery);
  } else {
    await loadBusinesses();
  }

  setStatusMessage("Business saved successfully!");
  toggleFormVisibility(false);
  businessForm.reset();
};

const handleSearchInput = (event) => {
  filterBusinesses(event.target.value);
};

const init = async () => {
  renderBusinesses(businesses);
  updateCategoryOptions();
  searchInputEl.addEventListener("input", handleSearchInput);
  businessListEl.addEventListener("click", handleBusinessClick);
  businessListEl.addEventListener("keydown", handleBusinessKeydown);
  toggleFormButton.addEventListener("click", () => {
    toggleFormVisibility(true, { shouldNavigate: true });
  });
  cancelButton.addEventListener("click", () => {
    toggleFormVisibility(false);
  });
  businessForm.addEventListener("submit", handleFormSubmit);
  businessForm.addEventListener("reset", () => toggleFormVisibility(false));
  setupLocationAutocomplete();

  const currentYear = new Date().getFullYear();
  copyrightYearEl.textContent = currentYear;

  const config = window.supabaseConfig ?? {};

  if (!config.url || !config.key) {
    setStatusMessage(
      "Supabase configuration is missing. Update window.supabaseConfig with your project details.",
      { variant: "error" }
    );
    return;
  }

  const { createClient } = supabase;
  supabaseClient = createClient(config.url, config.key);

  try {
    await loadBusinesses();
  } catch (error) {
    setStatusMessage(`Unexpected error loading businesses: ${error.message}`, {
      variant: "error",
    });
  }
};

// THEME TOGGLE LOGIC
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    toggle.checked = theme === "light";
  };

  const saved = localStorage.getItem("theme");
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const prefersDark = mediaQuery.matches;
  const initialTheme = saved || (prefersDark ? "dark" : "light");

  applyTheme(initialTheme);

  toggle.addEventListener("change", (event) => {
    const theme = event.target.checked ? "light" : "dark";
    applyTheme(theme);
    localStorage.setItem("theme", theme);
  });

  mediaQuery.addEventListener("change", (event) => {
    if (localStorage.getItem("theme")) return;
    applyTheme(event.matches ? "dark" : "light");
  });
});

init();

