# Known Issues & Fixes

Bugs rencontrés lors du bootstrap d'un projet basé sur ce template — et leur remédiation.

Le script `scripts/albo-create-mvp.sh` applique tous les fixes ci-dessous automatiquement. Cette doc sert quand quelqu'un débugue manuellement OU quand un nouveau bug apparaît avec une cause similaire.

> Pour les bugs liés au template compliance-grade `Albo-Club/albo-start-template`, voir [`son KNOWN_ISSUES.md`](https://github.com/Albo-Club/albo-start-template/blob/main/KNOWN_ISSUES.md) — sont indépendants.

---

(À enrichir au fil de l'eau — aucun bug rencontré à la date de scaffolding.)

---

## Comment ajouter une nouvelle entrée

Quand tu rencontres un bug pendant un bootstrap d'un projet client :

1. Note le symptôme exact (copier-coller du terminal ou de la console browser)
2. Identifie la root cause (lib en cause, pourquoi ça plante)
3. Trouve le fix (manuel d'abord)
4. Si le fix est mécanisable → ajoute-le à `scripts/albo-create-mvp.sh`
5. Documente ici en suivant ce template :

```markdown
## #N — Symptôme court

**Découvert** : YYYY-MM-DD
**Symptôme** : copier-coller du terminal/console

**Root cause** : explication technique courte.

**Fix appliqué dans le fork** : ce qui a été fait dans le repo et où.

**Manual fix** :
\`\`\`bash
commande exacte
\`\`\`
```
