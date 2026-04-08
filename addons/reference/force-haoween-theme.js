(function () {
  "use strict";

  // Replace all occurrences of src and srcset attributes
  function replaceAttributes(element, attributeName, oldValue, newValue) {
    if (element.hasAttribute(attributeName)) {
      element.setAttribute(
        attributeName,
        element.getAttribute(attributeName).replace(oldValue, newValue),
      );
    }
  }

  // Replace all occurrences of src and srcset attributes with the specified changes
  function replaceImageAttributes() {
    // Find all image elements on the page
    var images = document.querySelectorAll("img");

    // Iterate over each image element and replace the attributes
    images.forEach(function (image) {
      replaceAttributes(image, "src", "/assets/logo.png", "/assets/halloween/logo.png");
      replaceAttributes(image, "srcset", "/assets/logo.png 2x", "/assets/halloween/logo.png");
    });
  }

  // Call the function to replace image attributes
  replaceImageAttributes();

  // Add decoration
  var customStyles = `
        .p-body {
            background-image: url('https://f95zone.to/assets/halloween/web-left.png'),
                              url('https://f95zone.to/assets/halloween/web-right.png');
            background-position: left top, right top;
            background-repeat: no-repeat;
        }
    `;

  // Create a style element and append it to the document head
  var styleElement = document.createElement("style");
  styleElement.type = "text/css";
  styleElement.appendChild(document.createTextNode(customStyles));
  document.head.appendChild(styleElement);
})();
