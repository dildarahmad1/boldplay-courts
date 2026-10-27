import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateUiText } from "@/lib/uiTranslations";

const originalText = new WeakMap<Text, string>();
const lastTranslatedText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const lastTranslatedAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["placeholder", "aria-label", "title", "alt"];

const translateNode = (root: Node, language: ReturnType<typeof useLanguage>["language"]) => {
  const textNodes: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) textNodes.push(root as Text);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "CODE", "NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let current: Node | null;
  while ((current = walker.nextNode())) textNodes.push(current as Text);

  textNodes.forEach((node) => {
    const currentValue = node.textContent || "";
    const previousTranslation = lastTranslatedText.get(node);
    if (!originalText.has(node) || (previousTranslation !== undefined && currentValue !== previousTranslation)) {
      originalText.set(node, currentValue);
    }
    const source = originalText.get(node) || "";
    const next = translateUiText(source, language);
    lastTranslatedText.set(node, next);
    if (node.textContent !== next) node.textContent = next;
  });

  const elements: Element[] = root.nodeType === Node.ELEMENT_NODE ? [root as Element] : [];
  if ("querySelectorAll" in root) elements.push(...Array.from((root as Element | Document).querySelectorAll("[placeholder],[aria-label],[title],[alt]")));
  elements.forEach((element) => {
    let originals = originalAttributes.get(element);
    if (!originals) {
      originals = new Map();
      originalAttributes.set(element, originals);
    }
    let previousTranslations = lastTranslatedAttributes.get(element);
    if (!previousTranslations) {
      previousTranslations = new Map();
      lastTranslatedAttributes.set(element, previousTranslations);
    }
    translatedAttributes.forEach((attribute) => {
      const currentValue = element.getAttribute(attribute);
      if (currentValue === null) return;
      const previousTranslation = previousTranslations!.get(attribute);
      if (!originals!.has(attribute) || (previousTranslation !== undefined && currentValue !== previousTranslation)) {
        originals!.set(attribute, currentValue);
      }
      const source = originals!.get(attribute) || "";
      const next = translateUiText(source, language);
      previousTranslations!.set(attribute, next);
      if (currentValue !== next) element.setAttribute(attribute, next);
    });
  });
};

const AutoTranslator = () => {
  const { language } = useLanguage();

  useEffect(() => {
    let translating = false;
    let queued = false;
    let timer: number | undefined;
    const pendingRoots = new Set<Node>();
    const run = (node: Node = document.body) => {
      if (translating) return;
      translating = true;
      translateNode(node, language);
      translating = false;
    };

    const queueRun = (node: Node = document.body) => {
      pendingRoots.add(node);
      if (queued) return;
      queued = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        queued = false;
        const roots = [...pendingRoots];
        pendingRoots.clear();
        roots.forEach((root) => {
          if (root.isConnected && !roots.some((other) => other !== root && other.contains(root))) run(root);
        });
      }, 40);
    };

    document.title = translateUiText("Yarika — Book Sports Courts in Erbil, Kurdistan", language);
    run();
    const observer = new MutationObserver((mutations) => {
      if (translating || !mutations.length) return;
      mutations.forEach((mutation) => {
        // Batch DOM updates; translating every text mutation caused visible lag.
        if (mutation.type === "childList" && mutation.addedNodes.length) queueRun(mutation.target);
        if (mutation.type === "characterData") queueRun(mutation.target);
        if (mutation.type === "attributes") queueRun(mutation.target);
      });
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: translatedAttributes,
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [language]);

  return null;
};

export default AutoTranslator;
