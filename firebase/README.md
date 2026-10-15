Place google-services.json (Firebase → Mr B Yatzy → Android app com.simonpetersson.axelsyatzy) here.
It is committed (it holds only public app identifiers). `npm run cap:sync:android` copies it into android/app/.
Without it the Android app runs normally but push notifications are disabled.
