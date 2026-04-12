(function_declaration
  name: (identifier) @function.name) @function.definition

(method_definition
  name: (property_identifier) @method.name) @method.definition

(variable_declarator
  name: (identifier) @function.name
  value: [
    (arrow_function)
    (function_expression)
  ] @function.value) @function.definition
