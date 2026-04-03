# 📘 SAP UI5 Beginner Assignment — Student Registration Form

## 🎯 Objective
Build a simple Student Registration Form using SAP UI5 that demonstrates:
1. **SimpleForm** layout with labels and input fields
2. **Input placeholders** for user guidance
3. **Buttons** (Submit, Reset, Cancel) with icons
4. **Select (Dropdown)** for course selection
5. **i18n binding** using `sap.ui.model.resource.ResourceModel`
6. Core SAP libraries: `sap.m`, `sap.ui.layout`, `sap.ui.core`

---

## 📁 Project Structure

```
webapp/
├── index.html                        ← App bootstrap (SAP UI5 CDN + ComponentContainer)
├── Component.js                      ← App entry point; reads manifest.json
├── manifest.json                     ← App descriptor: models, routing, libs
├── i18n/
│   └── i18n.properties               ← All UI text strings (internationalization)
├── view/
│   └── Registration.view.xml         ← UI layout: form, fields, buttons
└── controller/
    └── Registration.controller.js    ← Business logic: validate, submit, reset
```

---

## 🧠 Key Concepts Explained

### 1. i18n (Internationalization)
**File:** `i18n/i18n.properties`

All user-visible text lives in this file as `key=value` pairs:
```properties
submitButton=Submit Registration
firstNamePlaceholder=Enter your first name
```

**Declared in `manifest.json`:**
```json
"i18n": {
  "type": "sap.ui.model.resource.ResourceModel",
  "settings": { "bundleName": "...i18n.i18n" }
}
```

**Used in XML View:**
```xml
<Button text="{i18n>submitButton}" />
<Input placeholder="{i18n>firstNamePlaceholder}" />
```

**Used in Controller:**
```js
this.getView().getModel("i18n").getResourceBundle().getText("successMessage");
```

---

### 2. SimpleForm (sap.ui.layout.form)
```xml
xmlns:f="sap.ui.layout.form"

<f:SimpleForm layout="ResponsiveGridLayout" editable="true">
  <f:content>
    <Label text="..." />
    <Input ... />
  </f:content>
</f:SimpleForm>
```
Labels and fields are paired automatically — every `Label` is followed by its control.

---

### 3. Input with Placeholder
```xml
<Input
    id="firstNameInput"
    placeholder="{i18n>firstNamePlaceholder}"
    valueLiveUpdate="true"
    maxLength="50" />
```
- `placeholder` — ghost text shown when field is empty
- `valueLiveUpdate` — fires events on every keystroke
- `maxLength` — limits characters

---

### 4. Select (Dropdown)
```xml
<Select id="courseSelect" forceSelection="false" width="100%">
    <items>
        <core:Item key="UI5" text="{i18n>courseUI5}" />
        <core:Item key="ABAP" text="{i18n>courseABAP}" />
    </items>
</Select>
```
Read the selected value in the controller:
```js
this.byId("courseSelect").getSelectedKey(); // returns "UI5", "ABAP", etc.
```

---

### 5. Buttons
```xml
<Button
    text="{i18n>submitButton}"
    type="Accept"
    icon="sap-icon://save"
    press="onSubmit" />
```
| `type`      | Color/Style       |
|-------------|-------------------|
| `Default`   | Grey (neutral)    |
| `Emphasized`| Blue (primary)    |
| `Accept`    | Green (positive)  |
| `Reject`    | Red (destructive) |

---

### 6. SAP Libraries Used
| Library              | Purpose                              |
|----------------------|--------------------------------------|
| `sap.m`              | Mobile-first controls (Button, Input, Select, MessageBox, MessageToast) |
| `sap.ui.layout.form` | SimpleForm, ResponsiveGridLayout     |
| `sap.ui.core`        | Core items (core:Item), Controller   |

---

## 🚀 How to Run

### Option A — SAP BTP / Business Application Studio
1. Open **SAP Business Application Studio**
2. Clone or import this project
3. Right-click `webapp/index.html` → **Run**

### Option B — VS Code with UI5 Tooling
```bash
npm install -g @ui5/cli
ui5 serve
```
Then open `http://localhost:8080`

### Option C — Simple Local Server
```bash
npx serve webapp/
```
Then open `http://localhost:3000`

---

## ✅ Assignment Tasks

Complete each task and verify the behavior:

| # | Task | File to Edit |
|---|------|-------------|
| 1 | Add a new i18n key `phoneLabel=Phone Number` and display it in the form | `i18n.properties` + `Registration.view.xml` |
| 2 | Add a phone number `<Input>` with a placeholder | `Registration.view.xml` |
| 3 | Add phone validation in `_validate()` (numbers only, 10 digits) | `Registration.controller.js` |
| 4 | Add a new dropdown item: `courseHANA=SAP HANA Database` | `i18n.properties` + `Registration.view.xml` |
| 5 | On successful submit, log the form values to the browser console | `Registration.controller.js` |
| 6 | Add a German translation file `i18n_de.properties` | New file in `i18n/` |

---

## 💡 Tips

- Use `this.byId("controlId")` in the controller to get a reference to any view control.
- Always call `UIComponent.prototype.init.apply(this, arguments)` in `Component.js`.
- The i18n model name `"i18n"` must match the key in `manifest.json` exactly.
- `sap-icon://` icons come from the SAP Icon Font. Browse them at: https://sapui5.hana.ondemand.com/sdk/#/topic/icon-explorer
