/** Jev chooses meanings. Code supplies IDs, coordinates, exact math and Figma writes. */
export type ObjectKind='component'|'circle'|'rectangle'|'text';
export type Target='current'|'selected'|'previous'|'first'|'middle'|'last'|'all'|'named';
export type Position='anchor'|'left'|'right'|'above'|'below';
export type CreationPosition={kind:'anchor'}|{kind:'relative';reference:Target;direction:Exclude<Position,'anchor'>};
export type Property='size'|'width'|'height'|'cornerRadius'|'fill'|'stroke'|'textColor'|'strokeWidth'|'layout'|'semanticRole'|'componentOverride'|'content';
export type ChangeMode='set'|'increase'|'decrease'|'restore';
export type NamedColor='red'|'blue'|'gray'|'green'|'yellow'|'black'|'white'|'primary'|'secondary'|'danger';
export type Role='primary'|'secondary'|'danger';
export type EditValue=
  | {kind:'step';count:1}
  | {kind:'length';amount:number;unit:'px'}
  | {kind:'color';name:NamedColor|`#${string}`;source:'literal'|'semantic'}
  | {kind:'layout';direction:'horizontal'|'vertical'}
  | {kind:'role';name:Role};
export type TextContent={kind:'text';text:string;source:{start:number;end:number}};

/** Jev's orthogonal answers always compose into this shape before Figma planning. */
export type EditCommand={
  kind:'edit';operation:'add'|'delete'|'set'|'adjust'|'duplicate'|'move'|'arrange'|'undo';
  operand:'object'|'text'|'property';target?:Target;
  parameters:{
    object?:ObjectKind;position?:CreationPosition;semantic?:'button';role?:Role;
    content?:TextContent;value?:EditValue|TextContent;property?:Property;mode?:ChangeMode;
    placement?:'center'|'existing-or-center';expectedObject?:ObjectKind;expectedSemantic?:'button';
    additional?:number;arrangement?:'horizontal'|'vertical';direction?:'horizontal'|'vertical'|'left'|'right'|'above'|'below';
    distance?:{kind:'length';amount:number;unit:'px'};
  };
};

export type ModifyCommand={kind:'modify';target:Target;property:Property;mode:ChangeMode;value?:EditValue|TextContent;
  slot?:'content';placement?:'center'|'existing-or-center';expectedObject?:ObjectKind;expectedSemantic?:'button'};
export type LiveCommand=
  | EditCommand
  | {kind:'create';object:ObjectKind;position:CreationPosition;semantic?:'button';role?:Role;content?:TextContent}
  | {kind:'duplicate';target:Target;additional:number;arrangement:'horizontal'|'vertical'}
  | ModifyCommand
  | {kind:'batch';commands:(ModifyCommand|EditCommand)[]}
  | {kind:'sequence';commands:LiveCommand[]}
  | {kind:'move';target:Target;direction:Exclude<Position,'anchor'>;distance:{kind:'length';amount:number;unit:'px'}}
  | {kind:'arrange';target:Target;direction:'horizontal'|'vertical'}
  | {kind:'undo';reason:'correction'|'explicit'};

export type LastEditSummary={action:LiveCommand['kind'];property?:Property;before:string;after:string};
export type ConversationContext={
  pageId:string;
  activeCount:number;
  selectedCount:number;
  selectedMatchesActive:boolean;
  activeObjects:ObjectKind[];
  activeSemantics:('button'|null)[];
  hasAnchor:boolean;
  lastEdit:LastEditSummary|null;
};
