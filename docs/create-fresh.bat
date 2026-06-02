@echo off
echo Creating fresh VoyVibe app with correct Expo SDK 54 dependencies...
cd /d "C:\Users\soumy\OneDrive\Documents\Claude\Projects\Viara"

REM Create fresh expo project
npx create-expo-app@latest VoyVibeFresh --template blank

REM Copy our source code into it
echo Copying source files...
xcopy /E /I /Y VoyVibeApp\src VoyVibeFresh\src
copy /Y VoyVibeApp\App.js VoyVibeFresh\App.js
copy /Y VoyVibeApp\app.json VoyVibeFresh\app.json

REM Install our extra dependencies with correct versions
cd VoyVibeFresh
npx expo install zustand @react-native-async-storage/async-storage @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context react-native-gesture-handler expo-linear-gradient expo-haptics @expo/vector-icons

echo.
echo Done! Run this next:
echo cd VoyVibeFresh
echo npx expo start --tunnel
pause
