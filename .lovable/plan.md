## Problem
På mobilen ligger brickan fortfarande för nära skärmens övre kant — det behövs mer andrum upptill.

## Ändring
I `src/pages/GamePage.tsx` (rad 233), öka padding-top på den yttre containern från `pt-7` till `pt-12` (≈ dubbelt så mycket luft uppe). `pb-6` och `safe-top` lämnas oförändrat så bottenavståndet och iOS notch-marginalen påverkas inte.

```diff
- pt-7 pb-6 sm:py-6
+ pt-12 pb-6 sm:py-6
```

Inget annat ändras — bara mobilens topputrymme.
