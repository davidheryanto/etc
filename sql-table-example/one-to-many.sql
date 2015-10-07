create table Table1 (
Id int identity(1,1),
Col1 nvarchar(255),
Col2 nvarchar(255)
);
alter table Table1 add constraint PK_Table1Id PRIMARY KEY (Id);

create table Table2 (
Id int identity(1,1),
Table1_Id int,
Col1 nvarchar(255),
Col2 nvarchar(255)
);
alter table Table2 add constraint PK_Table2Id primary key (Id);

alter table Table2
add constraint FK_Table2_Table1 foreign key (Table1_Id) references Table2(Id);

insert into Table1 values ('a','b'), ('c','d');
insert into Table2 values (2, 'a','b'), (2,'c','d');

select *
from Table1 
left join Table2 on Table2.Table1_Id = Table1.Id ;